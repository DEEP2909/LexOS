/* eslint-disable camelcase */
/**
 * Migration: Enforce Paddle billing uniqueness constraints on tenants.
 *
 * Why this exists:
 * Earlier migrations added paddle_* columns with `ADD COLUMN IF NOT EXISTS ... UNIQUE`.
 * When the columns already existed, PostgreSQL skipped the full column clause, including
 * UNIQUE enforcement. This migration enforces uniqueness explicitly and idempotently.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT
  `);

  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT paddle_customer_id
        FROM tenants
        WHERE paddle_customer_id IS NOT NULL
        GROUP BY paddle_customer_id
        HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'Duplicate paddle_customer_id values exist; deduplicate tenant billing records before enforcing uniqueness.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenants_paddle_customer_id_unique'
          AND conrelid = 'tenants'::regclass
      ) THEN
        ALTER TABLE tenants
          ADD CONSTRAINT tenants_paddle_customer_id_unique UNIQUE (paddle_customer_id);
      END IF;

      IF EXISTS (
        SELECT paddle_subscription_id
        FROM tenants
        WHERE paddle_subscription_id IS NOT NULL
        GROUP BY paddle_subscription_id
        HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'Duplicate paddle_subscription_id values exist; deduplicate tenant billing records before enforcing uniqueness.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenants_paddle_subscription_id_unique'
          AND conrelid = 'tenants'::regclass
      ) THEN
        ALTER TABLE tenants
          ADD CONSTRAINT tenants_paddle_subscription_id_unique UNIQUE (paddle_subscription_id);
      END IF;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_paddle_customer_id_unique,
    DROP CONSTRAINT IF EXISTS tenants_paddle_subscription_id_unique
  `);
};
