/**
 * EvidentIS API Versioning
 * Version prefix and deprecation handling
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './logger.js';

// ============================================================================
// Current API Version
// ============================================================================

export const CURRENT_API_VERSION = 'v1';
export const SUPPORTED_VERSIONS = ['v1'];
export const DEPRECATED_VERSIONS: string[] = [];

// ============================================================================
// Version Header Constants
// ============================================================================

export const API_VERSION_HEADER = 'X-API-Version';
export const DEPRECATION_HEADER = 'Deprecation';
export const SUNSET_HEADER = 'Sunset';

// ============================================================================
// Versioned Route Registration
// ============================================================================

/**
 * Register routes with version prefix
 * 
 * Usage:
 *   registerVersionedRoutes(app, 'v1', (app) => {
 *     app.get('/users', handler);  // becomes /v1/users
 *   });
 */
export async function registerVersionedRoutes(
  app: FastifyInstance,
  version: string,
  routeRegistrar: (app: FastifyInstance) => void | Promise<void>
): Promise<void> {
  // Create prefixed instance
  await app.register(async (versionedApp) => {
    // Add version header to all responses
    versionedApp.addHook('onSend', async (request, reply) => {
      reply.header(API_VERSION_HEADER, version);
      
      // Add deprecation headers if needed
      if (DEPRECATED_VERSIONS.includes(version)) {
        reply.header(DEPRECATION_HEADER, 'true');
        // Sunset date format: IMF-fixdate
        // Example: reply.header(SUNSET_HEADER, 'Sun, 01 Jan 2026 00:00:00 GMT');
      }
    });
    
    // Register the routes
    await routeRegistrar(versionedApp);
  }, { prefix: `/${version}` });
  
  logger.info({ version, prefix: `/${version}` }, 'Registered versioned routes');
}

// ============================================================================
// Version Negotiation Middleware
// ============================================================================

/**
 * Add version negotiation hook
 * Supports:
 *   - URL path version: /v1/users
 *   - Accept header: Accept: application/vnd.evidentis.v1+json
 *   - Custom header: X-API-Version: v1
 */
export function addVersionNegotiation(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract version from various sources
    let requestedVersion = extractVersion(request);
    
    // Default to current version if not specified
    if (!requestedVersion) {
      requestedVersion = CURRENT_API_VERSION;
    }
    
    // Validate version
    if (!SUPPORTED_VERSIONS.includes(requestedVersion) && 
        !DEPRECATED_VERSIONS.includes(requestedVersion)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'UNSUPPORTED_VERSION',
          message: `API version '${requestedVersion}' is not supported. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
        },
      });
    }
    
    // Warn about deprecated versions
    if (DEPRECATED_VERSIONS.includes(requestedVersion)) {
      logger.warn({
        requestedVersion,
        path: request.url,
        ip: request.ip,
      }, 'Request using deprecated API version');
    }
    
    // Attach version to request for handlers
    // biome-ignore lint/suspicious/noExplicitAny: Fastify request extension
    (request as any).apiVersion = requestedVersion;
  });
}

function extractVersion(request: FastifyRequest): string | null {
  // 1. Check URL path (e.g., /v1/users)
  const pathMatch = request.url.match(/^\/(v\d+)\//);
  if (pathMatch) {
    return pathMatch[1];
  }
  
  // 2. Check custom header
  const headerVersion = request.headers[API_VERSION_HEADER.toLowerCase()] as string;
  if (headerVersion) {
    return headerVersion;
  }
  
  // 3. Check Accept header for vendor type
  const accept = request.headers.accept || '';
  const vendorMatch = accept.match(/application\/vnd\.evidentis\.(v\d+)\+json/);
  if (vendorMatch) {
    return vendorMatch[1];
  }
  
  return null;
}

// ============================================================================
// Version-specific Routing
// ============================================================================

/**
 * Create a route that behaves differently based on version
 */
export function versionedHandler<T>(
  handlers: Record<string, (request: FastifyRequest, reply: FastifyReply) => Promise<T>>
): (request: FastifyRequest, reply: FastifyReply) => Promise<T> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<T> => {
    // biome-ignore lint/suspicious/noExplicitAny: Fastify request extension
    const version = (request as any).apiVersion || CURRENT_API_VERSION;
    
    const handler = handlers[version] || handlers[CURRENT_API_VERSION];
    if (!handler) {
      throw new Error(`No handler for version ${version}`);
    }
    
    return handler(request, reply);
  };
}

// ============================================================================
// Legacy Route Redirect
// ============================================================================

/**
 * Redirect legacy routes to versioned equivalents
 */
export function addLegacyRouteRedirects(
  app: FastifyInstance,
  legacyRoutes: Array<{ from: string; to: string }>
): void {
  for (const route of legacyRoutes) {
    // Support all common HTTP methods
    const methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'> = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    
    for (const method of methods) {
      app.route({
        method,
        url: route.from,
        handler: async (request, reply) => {
          // Preserve query string
          const queryString = request.url.split('?')[1];
          const redirectUrl = queryString ? `${route.to}?${queryString}` : route.to;
          
          logger.debug({ from: route.from, to: redirectUrl }, 'Redirecting legacy route');
          return reply.redirect(308, redirectUrl);
        },
      });
    }
  }
}

// ============================================================================
// Version Documentation
// ============================================================================

export interface VersionInfo {
  version: string;
  status: 'current' | 'supported' | 'deprecated';
  sunsetDate?: string;
  documentation?: string;
}

export function getVersionInfo(): VersionInfo[] {
  const versions: VersionInfo[] = [];
  
  for (const v of SUPPORTED_VERSIONS) {
    versions.push({
      version: v,
      status: v === CURRENT_API_VERSION ? 'current' : 'supported',
      documentation: `/docs/${v}`,
    });
  }
  
  for (const v of DEPRECATED_VERSIONS) {
    versions.push({
      version: v,
      status: 'deprecated',
      // Add sunset dates for deprecated versions
      documentation: `/docs/${v}`,
    });
  }
  
  return versions;
}
