/**
 * EvidentIS Billing Enforcement Middleware
 * Quota enforcement for documents and AI operations
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { checkQuota, incrementQuota, getBillingStatus, PLANS, type PlanType } from './billing.js';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

interface BillingContext {
  tenantId: string;
  plan: PlanType;
  status: string;
  quotas: {
    documents: { allowed: boolean; remaining: number; limit: number };
    research: { allowed: boolean; remaining: number; limit: number };
    attorneys: { current: number; limit: number | null };
  };
}

// ============================================================================
// Quota Enforcement Middleware
// ============================================================================

/**
 * Middleware to check document upload quota
 */
export async function enforceDocumentQuota(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
  
  if (!tenantId) {
    return; // Let auth middleware handle this
  }
  
  const quotaCheck = await checkQuota(tenantId, 'document');
  
  if (!quotaCheck.allowed) {
    logger.warn({ 
      tenantId, 
      used: quotaCheck.limit - quotaCheck.remaining,
      limit: quotaCheck.limit 
    }, 'Document quota exceeded');
    
    return reply.status(402).send({
      success: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'Document upload limit reached for this billing period',
        details: {
          type: 'document',
          used: quotaCheck.limit - quotaCheck.remaining,
          limit: quotaCheck.limit,
          upgradeUrl: '/billing?action=upgrade',
        },
      },
    });
  }
}

/**
 * Middleware to check research/AI query quota
 */
export async function enforceResearchQuota(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
  
  if (!tenantId) {
    return;
  }
  
  const quotaCheck = await checkQuota(tenantId, 'research');
  
  if (!quotaCheck.allowed) {
    logger.warn({ 
      tenantId, 
      used: quotaCheck.limit - quotaCheck.remaining,
      limit: quotaCheck.limit 
    }, 'Research quota exceeded');
    
    return reply.status(402).send({
      success: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'AI research query limit reached for this billing period',
        details: {
          type: 'research',
          used: quotaCheck.limit - quotaCheck.remaining,
          limit: quotaCheck.limit,
          upgradeUrl: '/billing?action=upgrade',
        },
      },
    });
  }
}

/**
 * Middleware to check attorney seat limit
 */
export async function enforceAttorneyLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
  
  if (!tenantId) {
    return;
  }
  
  const billingStatus = await getBillingStatus(tenantId);
  const { attorneysActive, attorneysLimit } = billingStatus.usage;
  
  // Skip if unlimited (enterprise)
  if (attorneysLimit === null) {
    return;
  }
  
  if (attorneysActive >= attorneysLimit) {
    logger.warn({ 
      tenantId, 
      current: attorneysActive,
      limit: attorneysLimit 
    }, 'Attorney seat limit reached');
    
    return reply.status(402).send({
      success: false,
      error: {
        code: 'SEAT_LIMIT_REACHED',
        message: `Your plan allows ${attorneysLimit} attorneys. Please upgrade to add more team members.`,
        details: {
          type: 'attorney_seats',
          current: attorneysActive,
          limit: attorneysLimit,
          upgradeUrl: '/billing?action=upgrade',
        },
      },
    });
  }
}

/**
 * Middleware to check subscription status (block if past_due/unpaid)
 */
export async function enforceActiveSubscription(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
  
  if (!tenantId) {
    return;
  }
  
  const billingStatus = await getBillingStatus(tenantId);
  
  // Allow active, trialing, and no subscription (for free tier/trial)
  const allowedStatuses = ['active', 'trialing', 'none'];
  
  if (!allowedStatuses.includes(billingStatus.status)) {
    logger.warn({ tenantId, status: billingStatus.status }, 'Subscription not active');
    
    return reply.status(402).send({
      success: false,
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: billingStatus.status === 'past_due' 
          ? 'Your payment is past due. Please update your payment method.'
          : 'An active subscription is required to use this feature.',
        details: {
          status: billingStatus.status,
          billingUrl: '/billing',
        },
      },
    });
  }
}

// ============================================================================
// Usage Tracking Hooks
// ============================================================================

/**
 * After-handler to track document usage
 */
export async function trackDocumentUsage(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only track successful responses
  if (reply.statusCode >= 200 && reply.statusCode < 300) {
    const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
    if (tenantId) {
      await incrementQuota(tenantId, 'document');
    }
  }
}

/**
 * After-handler to track research/AI usage
 */
export async function trackResearchUsage(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (reply.statusCode >= 200 && reply.statusCode < 300) {
    const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
    if (tenantId) {
      await incrementQuota(tenantId, 'research');
    }
  }
}

export async function incrementDocumentUsage(tenantId: string): Promise<void> {
  await incrementQuota(tenantId, 'document');
}

export async function incrementResearchUsage(tenantId: string): Promise<void> {
  await incrementQuota(tenantId, 'research');
}

// ============================================================================
// Feature Gate Middleware
// ============================================================================

/**
 * Check if tenant has access to a specific feature based on plan
 */
export function requireFeature(feature: keyof typeof PLANS.starter.features) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
    
    if (!tenantId) {
      return;
    }
    
    const billingStatus = await getBillingStatus(tenantId);
    const planConfig = PLANS[billingStatus.plan];
    
    // Feature check based on type
    switch (feature) {
      case 'aiTier':
        // All tiers have some AI access
        break;
        
      case 'support':
        // Support level is informational only
        break;
        
      default:
        // For limit-based features, they're handled by specific quota middleware
        break;
    }
  };
}

/**
 * Check if tenant has premium AI access
 */
export async function requirePremiumAI(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
  
  if (!tenantId) {
    return;
  }
  
  const billingStatus = await getBillingStatus(tenantId);
  const planConfig = PLANS[billingStatus.plan];
  
  if (planConfig.features.aiTier === 'opensource') {
    return reply.status(402).send({
      success: false,
      error: {
        code: 'PREMIUM_REQUIRED',
        message: 'This feature requires Growth plan or higher for premium AI models.',
        details: {
          currentPlan: billingStatus.plan,
          requiredTier: 'hybrid',
          upgradeUrl: '/billing?action=upgrade',
        },
      },
    });
  }
}

// ============================================================================
// Billing Context Helper
// ============================================================================

/**
 * Get full billing context for current request
 */
export async function getBillingContext(tenantId: string): Promise<BillingContext> {
  const billingStatus = await getBillingStatus(tenantId);
  const docQuota = await checkQuota(tenantId, 'document');
  const researchQuota = await checkQuota(tenantId, 'research');
  
  return {
    tenantId,
    plan: billingStatus.plan,
    status: billingStatus.status,
    quotas: {
      documents: docQuota,
      research: researchQuota,
      attorneys: {
        current: billingStatus.usage.attorneysActive,
        limit: billingStatus.usage.attorneysLimit,
      },
    },
  };
}
