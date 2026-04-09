process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://lexos:test@localhost:5432/lexos_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
process.env.FRONTEND_URL ??= 'http://localhost:3000';
process.env.JWT_PRIVATE_KEY_PATH ??= './keys/private.pem';
process.env.JWT_PUBLIC_KEY_PATH ??= './keys/public.pem';
