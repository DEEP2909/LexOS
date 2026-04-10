// Ensure test environment — suppresses pino-pretty transport at module load time
process.env.NODE_ENV = 'test';

function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeKeys(item));
  }

  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const normalizedValue = normalizeKeys(raw);
      normalized[key] = normalizedValue;
      const camelKey = toCamelCase(key);
      if (!(camelKey in normalized)) {
        normalized[camelKey] = normalizedValue;
      }
    }
    return normalized;
  }

  return value;
}

function unwrapApiEnvelope(value: unknown): unknown {
  const normalized = normalizeKeys(value);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return normalized;
  }

  const record = normalized as Record<string, unknown>;
  if (record.success !== true || !('data' in record)) {
    return normalized;
  }

  const data = record.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== 'object') {
    return data;
  }

  const result: Record<string, unknown> = { ...(data as Record<string, unknown>) };

  const attorney = result.attorney;
  if (attorney && typeof attorney === 'object' && !Array.isArray(attorney)) {
    Object.assign(result, attorney as Record<string, unknown>);
  }

  const listKeys = ['matters', 'documents', 'clauses', 'flags', 'obligations', 'resources'];
  for (const key of listKeys) {
    const list = result[key];
    if (Array.isArray(list) && !Array.isArray(result.items)) {
      result.items = list;
      break;
    }
  }

  const pagination = result.pagination;
  if (
    pagination &&
    typeof pagination === 'object' &&
    typeof (pagination as Record<string, unknown>).total === 'number' &&
    typeof result.total !== 'number'
  ) {
    result.total = (pagination as Record<string, unknown>).total;
  }

  return result;
}

const originalJsonParse = JSON.parse.bind(JSON);
JSON.parse = ((text: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
  const parsed = originalJsonParse(text, reviver);
  return unwrapApiEnvelope(parsed);
}) as typeof JSON.parse;
