import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from '../src/index';

let app: Awaited<ReturnType<typeof build>>;

describe('CI Smoke', () => {
  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness health endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { status?: string };
    expect(body.status).toBe('ok');
  });

  it('serves readiness endpoint with expected shape', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect([200, 503]).toContain(response.statusCode);
    const body = JSON.parse(response.body) as { status?: string; checks?: unknown };
    expect(body.status).toBeDefined();
    expect(body.checks).toBeDefined();
  });
});
