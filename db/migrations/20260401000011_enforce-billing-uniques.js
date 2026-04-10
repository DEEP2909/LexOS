/* eslint-disable camelcase */
/**
 * Migration: Enforce Stripe billing uniqueness constraints on tenants.
 *
 * Why this exists:
 * Earlier migrations added stripe_* columns with `ADD COLUMN IF NOT EXISTS ... UNIQUE`.
 * When the columns already existed, PostgreSQL skipped the full column clause, including
 * UNIQUE enforcement. This migration enforces uniqueness explicitly and idempotently.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT
  `);

  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT stripe_customer_id
        FROM tenants
        WHERE stripe_customer_id IS NOT NULL
        GROUP BY stripe_customer_id
        HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'Duplicate stripe_customer_id values exist; deduplicate tenant billing records before enforcing uniqueness.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenants_stripe_customer_id_unique'
          AND conrelid = 'tenants'::regclass
      ) THEN
        ALTER TABLE tenants
          ADD CONSTRAINT tenants_stripe_customer_id_unique UNIQUE (stripe_customer_id);
      END IF;

      IF EXISTS (
        SELECT stripe_subscription_id
        FROM tenants
        WHERE stripe_subscription_id IS NOT NULL
        GROUP BY stripe_subscription_id
        HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'Duplicate stripe_subscription_id values exist; deduplicate tenant billing records before enforcing uniqueness.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenants_stripe_subscription_id_unique'
          AND conrelid = 'tenants'::regclass
      ) THEN
        ALTER TABLE tenants
          ADD CONSTRAINT tenants_stripe_subscription_id_unique UNIQUE (stripe_subscription_id);
      END IF;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_stripe_customer_id_unique,
    DROP CONSTRAINT IF EXISTS tenants_stripe_subscription_id_unique
  `);
};
