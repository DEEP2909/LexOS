/**
 * EvidentIS Stripe Billing Integration
 * Full subscription management with Checkout and Customer Portal
 */

import Stripe from 'stripe';
import { config } from './config.js';
import { pool } from './database.js';
import { logger } from './logger.js';
import { auditRepo, tenantRepo } from './repository.js';
import { sendPaymentFailedEmail } from './email.js';
import crypto from 'crypto';

// ============================================================================
// Stripe Client
// ============================================================================

const stripe = new Stripe(config.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

// ============================================================================
// Plan Definitions
// ============================================================================

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 29900, // $299/month in cents
    priceId: config.STRIPE_PRICE_STARTER,
    features: {
      maxAttorneys: 5,
      maxDocumentsPerMonth: 100,
      maxResearchQueriesPerMonth: 200,
      aiTier: 'opensource',
      support: 'email',
    },
  },
  growth: {
    name: 'Growth',
    price: 89900, // $899/month
    priceId: config.STRIPE_PRICE_GROWTH,
    features: {
      maxAttorneys: 25,
      maxDocumentsPerMonth: 500,
      maxResearchQueriesPerMonth: 1000,
      aiTier: 'hybrid',
      support: 'priority_email',
    },
  },
  professional: {
    name: 'Professional',
    price: 219900, // $2,199/month
    priceId: config.STRIPE_PRICE_PROFESSIONAL,
    features: {
      maxAttorneys: 100,
      maxDocumentsPerMonth: 2000,
      maxResearchQueriesPerMonth: 5000,
      aiTier: 'premium_api',
      support: 'phone_priority',
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: null, // Custom pricing
    priceId: null,
    features: {
      maxAttorneys: null, // Unlimited
      maxDocumentsPerMonth: null,
      maxResearchQueriesPerMonth: null,
      aiTier: 'premium_api',
      support: 'dedicated_csm',
    },
  },
} as const;

export type PlanType = keyof typeof PLANS;

// ============================================================================
// Customer Management
// ============================================================================

export async function getOrCreateStripeCustomer(tenantId: string, email: string, name: string): Promise<string> {
  // Check if customer already exists
  const tenant = await tenantRepo.findById(tenantId);
  
  if (tenant?.stripe_customer_id) {
    return tenant.stripe_customer_id;
  }
  
  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      tenant_id: tenantId,
    },
  });
  
  // Save customer ID
  await pool.query(
    `UPDATE tenants SET stripe_customer_id = $2 WHERE id = $1`,
    [tenantId, customer.id]
  );
  
  logger.info({ tenantId, customerId: customer.id }, 'Created Stripe customer');
  return customer.id;
}

// ============================================================================
// Checkout Session
// ============================================================================

export async function createCheckoutSession(
  tenantId: string,
  attorneyEmail: string,
  firmName: string,
  plan: PlanType,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  const planConfig = PLANS[plan];
  
  if (!planConfig.priceId) {
    throw new Error('Enterprise plan requires custom quote - contact sales');
  }
  
  const customerId = await getOrCreateStripeCustomer(tenantId, attorneyEmail, firmName);
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: planConfig.priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      tenant_id: tenantId,
      plan,
    },
    subscription_data: {
      metadata: {
        tenant_id: tenantId,
        plan,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
  });
  
  logger.info({ tenantId, plan, sessionId: session.id }, 'Created checkout session');

  if (!session.url) {
    throw new Error('Stripe checkout session URL missing');
  }
  
  return {
    sessionId: session.id,
    url: session.url,
  };
}

// ============================================================================
// Customer Portal
// ============================================================================

export async function createCustomerPortalSession(
  tenantId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const tenant = await tenantRepo.findById(tenantId);
  
  if (!tenant?.stripe_customer_id) {
    throw new Error('No billing account found. Please set up billing first.');
  }
  
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripe_customer_id,
    return_url: returnUrl,
  });
  
  logger.info({ tenantId }, 'Created customer portal session');
  
  return { url: session.url };
}

// ============================================================================
// Subscription Status
// ============================================================================

export interface BillingStatus {
  plan: PlanType;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none';
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  usage: {
    documentsThisMonth: number;
    documentsLimit: number | null;
    researchThisMonth: number;
    researchLimit: number | null;
    attorneysActive: number;
    attorneysLimit: number | null;
  };
}

export async function getBillingStatus(tenantId: string): Promise<BillingStatus> {
  const tenant = await tenantRepo.findById(tenantId);
  
  // Get quota usage
  const quotaResult = await pool.query(
    `SELECT monthly_doc_limit, monthly_research_limit, current_month_docs, current_month_research
     FROM tenant_ai_quotas WHERE tenant_id = $1`,
    [tenantId]
  );
  
  const attorneyResult = await pool.query(
    `SELECT COUNT(*) FROM attorneys WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId]
  );
  
  const quota = quotaResult.rows[0] || {
    monthly_doc_limit: 100,
    monthly_research_limit: 500,
    current_month_docs: 0,
    current_month_research: 0,
  };
  
  const planConfig = PLANS[tenant?.plan as PlanType] || PLANS.starter;
  
  // Default status for no subscription
  const status: BillingStatus = {
    plan: (tenant?.plan || 'starter') as PlanType,
    status: 'none',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : null,
    usage: {
      documentsThisMonth: quota.current_month_docs,
      documentsLimit: planConfig.features.maxDocumentsPerMonth,
      researchThisMonth: quota.current_month_research,
      researchLimit: planConfig.features.maxResearchQueriesPerMonth,
      attorneysActive: Number.parseInt(attorneyResult.rows[0].count),
      attorneysLimit: planConfig.features.maxAttorneys,
    },
  };
  
  // Check trial status
  if (tenant?.trial_ends_at && new Date(tenant.trial_ends_at) > new Date()) {
    status.status = 'trialing';
  }
  
  // Check Stripe subscription
  if (tenant?.stripe_subscription_id) {
    try {
      const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
      
      status.status = subscription.status as BillingStatus['status'];
      status.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      status.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    } catch (error: any) {
      logger.warn({ tenantId, error: error.message }, 'Failed to fetch subscription');
    }
  }
  
  return status;
}

// ============================================================================
// Quota Checking
// ============================================================================

export async function checkQuota(
  tenantId: string,
  quotaType: 'document' | 'research'
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const quota = await pool.query(
    `SELECT monthly_doc_limit, monthly_research_limit, current_month_docs, current_month_research
     FROM tenant_ai_quotas WHERE tenant_id = $1`,
    [tenantId]
  );
  
  if (!quota.rows[0]) {
    // Create default quota
    await pool.query(
      `INSERT INTO tenant_ai_quotas (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [tenantId]
    );
    return { allowed: true, remaining: 100, limit: 100 };
  }
  
  const q = quota.rows[0];
  
  if (quotaType === 'document') {
    const limit = q.monthly_doc_limit;
    const used = q.current_month_docs;
    return {
      allowed: limit === null || used < limit,
      remaining: limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
      limit: limit || 0,
    };
  }

  const limit = q.monthly_research_limit;
  const used = q.current_month_research;
  return {
    allowed: limit === null || used < limit,
    remaining: limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
    limit: limit || 0,
  };
}

export async function incrementQuota(tenantId: string, quotaType: 'document' | 'research'): Promise<void> {
  const column = quotaType === 'document' ? 'current_month_docs' : 'current_month_research';
  
  await pool.query(
    `UPDATE tenant_ai_quotas SET ${column} = ${column} + 1 WHERE tenant_id = $1`,
    [tenantId]
  );
}

// ============================================================================
// Webhook Handling
// ============================================================================

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string
): Promise<{ received: boolean }> {
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (error: any) {
    logger.error({ error: error.message }, 'Stripe webhook signature verification failed');
    throw new Error('Invalid signature');
  }
  
  logger.info({ type: event.type, id: event.id }, 'Processing Stripe webhook');
  
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }
    
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdated(subscription);
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCanceled(subscription);
      break;
    }
    
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentSucceeded(invoice);
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
    }
    
    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe event');
  }
  
  return { received: true };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const tenantId = session.metadata?.tenant_id;
  const plan = session.metadata?.plan as PlanType;
  
  if (!tenantId) {
    logger.warn({ sessionId: session.id }, 'Checkout completed without tenant_id');
    return;
  }
  
  // Update tenant with subscription info
  await pool.query(
    `UPDATE tenants 
     SET stripe_subscription_id = $2, plan = $3, subscription_status = 'active', trial_ends_at = NULL
     WHERE id = $1`,
    [tenantId, session.subscription, plan]
  );
  
  // Update quotas based on plan
  const planConfig = PLANS[plan];
  await pool.query(
    `INSERT INTO tenant_ai_quotas (tenant_id, monthly_doc_limit, monthly_research_limit, api_tier)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id) DO UPDATE SET 
       monthly_doc_limit = $2, monthly_research_limit = $3, api_tier = $4`,
    [tenantId, planConfig.features.maxDocumentsPerMonth, 
     planConfig.features.maxResearchQueriesPerMonth, planConfig.features.aiTier]
  );
  
  // Audit log
  await auditRepo.create({
    tenantId,
    eventType: 'subscription.created',
    objectType: 'subscription',
    objectId: session.subscription as string,
    metadata: { plan, sessionId: session.id },
  });
  
  logger.info({ tenantId, plan }, 'Subscription activated');
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const tenantId = subscription.metadata?.tenant_id;
  
  if (!tenantId) {
    logger.warn({ subscriptionId: subscription.id }, 'Subscription updated without tenant_id');
    return;
  }
  
  await pool.query(
    `UPDATE tenants SET subscription_status = $2 WHERE id = $1`,
    [tenantId, subscription.status]
  );
  
  logger.info({ tenantId, status: subscription.status }, 'Subscription updated');
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
  const tenantId = subscription.metadata?.tenant_id;
  
  if (!tenantId) return;
  
  await pool.query(
    `UPDATE tenants SET subscription_status = 'canceled', plan = 'starter' WHERE id = $1`,
    [tenantId]
  );
  
  // Reset to free tier quotas
  await pool.query(
    `UPDATE tenant_ai_quotas SET monthly_doc_limit = 10, monthly_research_limit = 20, api_tier = 'opensource'
     WHERE tenant_id = $1`,
    [tenantId]
  );
  
  await auditRepo.create({
    tenantId,
    eventType: 'subscription.canceled',
    objectType: 'subscription',
    objectId: subscription.id,
  });
  
  logger.info({ tenantId }, 'Subscription canceled');
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  
  // Find tenant by customer ID
  const tenant = await pool.query(
    `SELECT id FROM tenants WHERE stripe_customer_id = $1`,
    [customerId]
  );
  
  if (!tenant.rows[0]) return;
  const tenantId = tenant.rows[0].id;
  
  // Reset monthly quotas on successful payment
  await pool.query(
    `UPDATE tenant_ai_quotas 
     SET current_month_docs = 0, current_month_research = 0, quota_reset_at = now() + INTERVAL '1 month'
     WHERE tenant_id = $1`,
    [tenantId]
  );
  
  await auditRepo.create({
    tenantId,
    eventType: 'invoice.paid',
    objectType: 'invoice',
    objectId: invoice.id,
    metadata: { amount: invoice.amount_paid },
  });
  
  logger.info({ tenantId, invoiceId: invoice.id, amount: invoice.amount_paid }, 'Payment succeeded');
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  
  const tenant = await pool.query(
    `SELECT id, settings FROM tenants WHERE stripe_customer_id = $1`,
    [customerId]
  );
  
  if (!tenant.rows[0]) return;
  const tenantId = tenant.rows[0].id;
  
  // Update status
  await pool.query(
    `UPDATE tenants SET subscription_status = 'past_due' WHERE id = $1`,
    [tenantId]
  );
  
  const adminResult = await pool.query<{ email: string }>(
    `SELECT email
     FROM attorneys
     WHERE tenant_id = $1
       AND role = 'admin'
       AND status = 'active'
     ORDER BY created_at ASC
     LIMIT 1`,
    [tenantId]
  );

  const adminEmail = adminResult.rows[0]?.email;
  if (adminEmail) {
    const invoiceUrl = invoice.hosted_invoice_url || `${config.FRONTEND_URL}/billing`;
    try {
      await sendPaymentFailedEmail(adminEmail, invoice.amount_due || 0, invoiceUrl);
    } catch (notifyError: any) {
      logger.error(
        { tenantId, invoiceId: invoice.id, error: notifyError.message },
        'Failed to send payment failed email'
      );
    }
  } else {
    logger.warn({ tenantId, invoiceId: invoice.id }, 'No active admin found for payment failure email');
  }
  
  await auditRepo.create({
    tenantId,
    eventType: 'invoice.failed',
    objectType: 'invoice',
    objectId: invoice.id,
    metadata: { amount: invoice.amount_due },
  });
  
  logger.warn({ tenantId, invoiceId: invoice.id }, 'Payment failed');
}

// ============================================================================
// Usage Reporting (for metered billing)
// ============================================================================

export async function reportUsage(
  subscriptionItemId: string,
  quantity: number,
  action: 'set' | 'increment' = 'increment'
): Promise<void> {
  await stripe.subscriptionItems.createUsageRecord(
    subscriptionItemId,
    {
      quantity,
      timestamp: Math.floor(Date.now() / 1000),
      action,
    }
  );
}
