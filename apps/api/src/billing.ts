/**
 * EvidentIS Paddle Billing Integration
 * Full subscription management with Paddle Billing and webhook processing.
 */

import { EventName, Paddle, type EventEntity } from '@paddle/paddle-node-sdk';
import { config } from './config.js';
import { pool } from './database.js';
import { logger } from './logger.js';
import { auditRepo, tenantRepo } from './repository.js';
import { sendPaymentFailedEmail } from './email.js';

// ============================================================================
// Paddle Client
// ============================================================================

const paddle = config.PADDLE_API_KEY ? new Paddle(config.PADDLE_API_KEY) : null;

function getPaddleClient(): Paddle {
  if (!paddle) {
    throw new Error('Paddle billing is not configured (missing PADDLE_API_KEY)');
  }
  return paddle;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ============================================================================
// Plan Definitions
// ============================================================================

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 29900, // $299/month in cents
    priceId: config.PADDLE_PRICE_STARTER,
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
    priceId: config.PADDLE_PRICE_GROWTH,
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
    priceId: config.PADDLE_PRICE_PROFESSIONAL,
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

interface SubscriptionEventData {
  id: string;
  status: string;
  customerId: string;
  currentBillingPeriod?: { endsAt: string } | null;
  scheduledChange?: { action: string } | null;
  items?: Array<{ price?: { id: string } | null }>;
  customData?: Record<string, unknown> | null;
}

interface TransactionEventData {
  id: string;
  customerId: string | null;
  checkout?: { url: string | null } | null;
  details?: { totals?: { grandTotal: string } | null } | null;
}

function isPlanType(value: string): value is PlanType {
  return Object.prototype.hasOwnProperty.call(PLANS, value);
}

function inferPlanFromPriceId(priceId: string | null | undefined): PlanType | null {
  if (!priceId) {
    return null;
  }
  if (config.PADDLE_PRICE_STARTER && priceId === config.PADDLE_PRICE_STARTER) {
    return 'starter';
  }
  if (config.PADDLE_PRICE_GROWTH && priceId === config.PADDLE_PRICE_GROWTH) {
    return 'growth';
  }
  if (config.PADDLE_PRICE_PROFESSIONAL && priceId === config.PADDLE_PRICE_PROFESSIONAL) {
    return 'professional';
  }
  return null;
}

function getCustomDataValue(
  customData: Record<string, unknown> | null | undefined,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = customData?.[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

function parseMinorAmount(amount: string | null | undefined): number {
  const parsed = Number.parseInt(amount ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toUuidOrUndefined(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value) ? value : undefined;
}

async function resolveTenantIdByCustomerId(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) {
    return null;
  }

  const tenant = await pool.query<{ id: string }>(
    `SELECT id FROM tenants WHERE paddle_customer_id = $1`,
    [customerId]
  );
  return tenant.rows[0]?.id ?? null;
}

async function resolveTenantContextFromSubscription(
  subscription: SubscriptionEventData
): Promise<{ tenantId: string | null; plan: PlanType | null }> {
  const tenantIdFromCustomData = getCustomDataValue(subscription.customData, ['tenantId', 'tenant_id']);
  const tenantId = tenantIdFromCustomData ?? await resolveTenantIdByCustomerId(subscription.customerId);

  const planFromCustomData = getCustomDataValue(subscription.customData, ['plan']);
  const validatedPlan = planFromCustomData && isPlanType(planFromCustomData) ? planFromCustomData : null;

  const itemPriceId = subscription.items?.[0]?.price?.id ?? null;
  const inferredPlan = inferPlanFromPriceId(itemPriceId);

  return {
    tenantId,
    plan: validatedPlan ?? inferredPlan,
  };
}

// ============================================================================
// Customer Management
// ============================================================================

export async function getOrCreatePaddleCustomer(
  tenantId: string,
  email: string,
  name: string
): Promise<string> {
  const tenant = await tenantRepo.findById(tenantId);
  if (tenant?.paddle_customer_id) {
    return tenant.paddle_customer_id;
  }

  const customer = await getPaddleClient().customers.create({
    email,
    name,
    customData: {
      tenantId,
    },
  });

  await pool.query(
    `UPDATE tenants SET paddle_customer_id = $2 WHERE id = $1`,
    [tenantId, customer.id]
  );

  logger.info({ tenantId, customerId: customer.id }, 'Created Paddle customer');
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

  const customerId = await getOrCreatePaddleCustomer(tenantId, attorneyEmail, firmName);
  const transaction = await getPaddleClient().transactions.create({
    items: [
      {
        priceId: planConfig.priceId,
        quantity: 1,
      },
    ],
    customerId,
    status: 'ready',
    collectionMode: 'automatic',
    customData: {
      tenantId,
      plan,
      successUrl,
      cancelUrl,
    },
    checkout: {
      url: successUrl,
    },
  });

  const checkoutUrl = transaction.checkout?.url;
  if (!checkoutUrl) {
    throw new Error('Paddle checkout URL missing');
  }

  logger.info({ tenantId, plan, transactionId: transaction.id }, 'Created Paddle checkout transaction');
  return {
    sessionId: transaction.id,
    url: checkoutUrl,
  };
}

// ============================================================================
// Customer Portal
// ============================================================================

export async function createCustomerPortalSession(
  tenantId: string,
  _returnUrl: string
): Promise<{ url: string }> {
  const tenant = await tenantRepo.findById(tenantId);

  if (!tenant?.paddle_customer_id) {
    throw new Error('No billing account found. Please set up billing first.');
  }
  if (!tenant?.paddle_subscription_id) {
    throw new Error('No active subscription found for this tenant.');
  }

  const session = await getPaddleClient().customerPortalSessions.create(
    tenant.paddle_customer_id,
    [tenant.paddle_subscription_id]
  );

  const portalUrl = session.urls.general.overview;
  if (!portalUrl) {
    throw new Error('Paddle customer portal URL missing');
  }

  logger.info({ tenantId, portalSessionId: session.id }, 'Created Paddle customer portal session');
  return { url: portalUrl };
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

function mapPaddleStatus(status: string | null | undefined): BillingStatus['status'] {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
      return status;
    case 'paused':
      return 'unpaid';
    default:
      return 'none';
  }
}

export async function getBillingStatus(tenantId: string): Promise<BillingStatus> {
  const tenant = await tenantRepo.findById(tenantId);

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

  const plan: PlanType = (tenant?.plan && isPlanType(tenant.plan)) ? tenant.plan : 'starter';
  const planConfig = PLANS[plan];

  const status: BillingStatus = {
    plan,
    status: 'none',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : null,
    usage: {
      documentsThisMonth: quota.current_month_docs,
      documentsLimit: planConfig.features.maxDocumentsPerMonth,
      researchThisMonth: quota.current_month_research,
      researchLimit: planConfig.features.maxResearchQueriesPerMonth,
      attorneysActive: Number.parseInt(attorneyResult.rows[0].count, 10),
      attorneysLimit: planConfig.features.maxAttorneys,
    },
  };

  if (tenant?.trial_ends_at && new Date(tenant.trial_ends_at) > new Date()) {
    status.status = 'trialing';
  }

  if (tenant?.paddle_subscription_id) {
    try {
      const subscription = await getPaddleClient().subscriptions.get(tenant.paddle_subscription_id);
      status.status = mapPaddleStatus(subscription.status);
      status.currentPeriodEnd = subscription.currentBillingPeriod?.endsAt
        ? new Date(subscription.currentBillingPeriod.endsAt)
        : null;
      status.cancelAtPeriodEnd = subscription.scheduledChange?.action === 'cancel';
    } catch (error) {
      logger.warn(
        { tenantId, error: getErrorMessage(error) },
        'Failed to fetch Paddle subscription'
      );
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

export async function handlePaddleWebhook(
  rawBody: Buffer,
  signature: string
): Promise<{ received: boolean }> {
  const webhookSecret = config.PADDLE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('PADDLE_WEBHOOK_SECRET is not configured');
  }

  let event: EventEntity;
  try {
    event = await getPaddleClient().webhooks.unmarshal(rawBody.toString(), webhookSecret, signature);
  } catch (error) {
    logger.error({ error: getErrorMessage(error) }, 'Paddle webhook signature verification failed');
    throw new Error('Invalid signature');
  }

  logger.info({ type: event.eventType, id: event.eventId }, 'Processing Paddle webhook');

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionTrialing:
    case EventName.SubscriptionPastDue:
    case EventName.SubscriptionResumed:
    case EventName.SubscriptionPaused:
      await handleSubscriptionUpsert(event.data as SubscriptionEventData, event.eventType);
      break;

    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data as SubscriptionEventData);
      break;

    case EventName.TransactionCompleted:
    case EventName.TransactionPaid:
      await handlePaymentSucceeded(event.data as TransactionEventData);
      break;

    case EventName.TransactionPaymentFailed:
      await handlePaymentFailed(event.data as TransactionEventData);
      break;

    default:
      logger.debug({ type: event.eventType }, 'Unhandled Paddle webhook event');
  }

  return { received: true };
}

async function handleSubscriptionUpsert(subscription: SubscriptionEventData, eventType: string): Promise<void> {
  const { tenantId, plan } = await resolveTenantContextFromSubscription(subscription);
  if (!tenantId) {
    logger.warn({ subscriptionId: subscription.id }, 'Subscription event could not be linked to tenant');
    return;
  }

  await pool.query(
    `UPDATE tenants
     SET paddle_subscription_id = $2,
         subscription_status = $3,
         plan = COALESCE($4, plan),
         trial_ends_at = CASE WHEN $3 = 'active' THEN NULL ELSE trial_ends_at END
     WHERE id = $1`,
    [tenantId, subscription.id, mapPaddleStatus(subscription.status), plan]
  );

  if (plan) {
    const planConfig = PLANS[plan];
    await pool.query(
      `INSERT INTO tenant_ai_quotas (tenant_id, monthly_doc_limit, monthly_research_limit, api_tier)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) DO UPDATE SET
         monthly_doc_limit = $2,
         monthly_research_limit = $3,
         api_tier = $4`,
      [
        tenantId,
        planConfig.features.maxDocumentsPerMonth,
        planConfig.features.maxResearchQueriesPerMonth,
        planConfig.features.aiTier,
      ]
    );
  }

  await auditRepo.create({
    tenantId,
    eventType: eventType === EventName.SubscriptionCreated ? 'subscription.created' : 'subscription.updated',
    objectType: 'subscription',
    objectId: toUuidOrUndefined(subscription.id),
    metadata: {
      paddleSubscriptionId: subscription.id,
      status: subscription.status,
      plan,
      customerId: subscription.customerId,
    },
  });

  logger.info({ tenantId, subscriptionId: subscription.id, status: subscription.status, plan }, 'Subscription updated');
}

async function handleSubscriptionCanceled(subscription: SubscriptionEventData): Promise<void> {
  const { tenantId } = await resolveTenantContextFromSubscription(subscription);
  if (!tenantId) {
    logger.warn({ subscriptionId: subscription.id }, 'Subscription cancellation could not be linked to tenant');
    return;
  }

  await pool.query(
    `UPDATE tenants
     SET paddle_subscription_id = $2,
         subscription_status = 'canceled',
         plan = 'starter'
     WHERE id = $1`,
    [tenantId, subscription.id]
  );

  await pool.query(
    `UPDATE tenant_ai_quotas
     SET monthly_doc_limit = 10,
         monthly_research_limit = 20,
         api_tier = 'opensource'
     WHERE tenant_id = $1`,
    [tenantId]
  );

  await auditRepo.create({
    tenantId,
    eventType: 'subscription.canceled',
    objectType: 'subscription',
    objectId: toUuidOrUndefined(subscription.id),
    metadata: {
      paddleSubscriptionId: subscription.id,
    },
  });

  logger.info({ tenantId, subscriptionId: subscription.id }, 'Subscription canceled');
}

async function handlePaymentSucceeded(transaction: TransactionEventData): Promise<void> {
  const tenantId = await resolveTenantIdByCustomerId(transaction.customerId);
  if (!tenantId) {
    return;
  }

  await pool.query(
    `UPDATE tenant_ai_quotas
     SET current_month_docs = 0,
         current_month_research = 0,
         quota_reset_at = now() + INTERVAL '1 month'
     WHERE tenant_id = $1`,
    [tenantId]
  );

  await pool.query(
    `UPDATE tenants
     SET subscription_status = 'active'
     WHERE id = $1 AND subscription_status != 'canceled'`,
    [tenantId]
  );

  const amountPaid = parseMinorAmount(transaction.details?.totals?.grandTotal);
  await auditRepo.create({
    tenantId,
    eventType: 'invoice.paid',
    objectType: 'invoice',
    objectId: toUuidOrUndefined(transaction.id),
    metadata: {
      amount: amountPaid,
      paddleTransactionId: transaction.id,
    },
  });

  logger.info({ tenantId, transactionId: transaction.id, amount: amountPaid }, 'Payment succeeded');
}

async function handlePaymentFailed(transaction: TransactionEventData): Promise<void> {
  if (!transaction.customerId) {
    return;
  }

  const tenant = await pool.query<{ id: string }>(
    `SELECT id FROM tenants WHERE paddle_customer_id = $1`,
    [transaction.customerId]
  );

  if (!tenant.rows[0]) {
    return;
  }
  const tenantId = tenant.rows[0].id;

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
  const amountDue = parseMinorAmount(transaction.details?.totals?.grandTotal);
  const invoiceUrl = transaction.checkout?.url || `${config.FRONTEND_URL}/billing`;

  if (adminEmail) {
    try {
      await sendPaymentFailedEmail(adminEmail, amountDue, invoiceUrl);
    } catch (notifyError) {
      logger.error(
        { tenantId, transactionId: transaction.id, error: getErrorMessage(notifyError) },
        'Failed to send payment failed email'
      );
    }
  } else {
    logger.warn({ tenantId, transactionId: transaction.id }, 'No active admin found for payment failure email');
  }

  await auditRepo.create({
    tenantId,
    eventType: 'invoice.failed',
    objectType: 'invoice',
    objectId: toUuidOrUndefined(transaction.id),
    metadata: {
      amount: amountDue,
      paddleTransactionId: transaction.id,
    },
  });

  logger.warn({ tenantId, transactionId: transaction.id, amount: amountDue }, 'Payment failed');
}

// ============================================================================
// Usage Reporting (for metered billing)
// ============================================================================

export async function reportUsage(
  subscriptionId: string,
  quantity: number,
  action: 'set' | 'increment' = 'increment'
): Promise<void> {
  logger.error(
    { subscriptionId, quantity, action },
    'Metered usage reporting requires a Paddle metered-price configuration'
  );
  throw new Error('Paddle metered usage reporting is not configured');
}
