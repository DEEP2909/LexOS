/**
 * EvidentIS OpenTelemetry Tracing
 * Required per spec: OpenTelemetry spans on ALL DB queries, AI calls, job processing
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { trace, context, SpanStatusCode, type Span, SpanKind, type Tracer } from '@opentelemetry/api';
import { config } from './config.js';

const SERVICE_NAME = config.OTEL_SERVICE_NAME || 'evidentis-api';
const SERVICE_VERSION = '1.0.0';

// Initialize SDK
let sdk: NodeSDK | null = null;

export function initTracing(): void {
  if (config.NODE_ENV === 'test') {
    return; // Skip tracing in test environment
  }

  const exporter = new OTLPTraceExporter({
    url: config.OTEL_EXPORTER_OTLP_ENDPOINT 
      ? `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
      : 'http://localhost:4318/v1/traces',
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
      [SEMRESATTRS_SERVICE_VERSION]: SERVICE_VERSION,
    }),
    traceExporter: exporter,
    instrumentations: [
      new HttpInstrumentation(),
      new FastifyInstrumentation(),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
      new RedisInstrumentation(),
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk?.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((err) => console.error('Error shutting down tracing', err))
      .finally(() => process.exit(0));
  });
}

export function getTracer(): Tracer {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

// ============================================================================
// Span Helpers for Manual Instrumentation
// ============================================================================

export interface SpanOptions {
  operation: string;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Wrap a function with a tracing span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer();
  
  return tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL }, async (span) => {
    try {
      if (options?.attributes) {
        span.setAttributes(options.attributes);
      }
      
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: error?.message || 'Unknown error' 
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Trace a database operation
 */
export async function traceDbOperation<T>(
  operation: string,
  table: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`db.${operation}`, async (span) => {
    span.setAttributes({
      'db.system': 'postgresql',
      'db.operation': operation,
      'db.table': table,
    });
    return fn();
  });
}

/**
 * Trace an AI service call
 */
export async function traceAiCall<T>(
  endpoint: string,
  model: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`ai.${endpoint}`, async (span) => {
    span.setAttributes({
      'ai.endpoint': endpoint,
      'ai.model': model,
      'ai.service': 'evidentis-ai-service',
    });
    const startTime = Date.now();
    const result = await fn();
    span.setAttributes({
      'ai.duration_ms': Date.now() - startTime,
    });
    return result;
  });
}

/**
 * Trace a background job
 */
export async function traceJob<T>(
  jobType: string,
  jobId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`job.${jobType}`, async (span) => {
    span.setAttributes({
      'job.type': jobType,
      'job.id': jobId,
      kind: SpanKind.CONSUMER,
    });
    return fn();
  });
}

/**
 * Add event to current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.addEvent(name, attributes);
  }
}

/**
 * Set attribute on current span
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.setAttribute(key, value);
  }
}

/**
 * Get current trace info for logging/debugging
 */
export function getTraceInfo(): { traceId: string; spanId: string } | null {
  const currentSpan = trace.getActiveSpan();
  if (!currentSpan) return null;
  
  const spanContext = currentSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

// ============================================================================
// Health Check Integration
// ============================================================================

export function getTracingStatus(): Record<string, any> {
  return {
    enabled: config.NODE_ENV !== 'test',
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    exporterEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  };
}
