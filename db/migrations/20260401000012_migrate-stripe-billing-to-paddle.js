/* eslint-disable camelcase */
/**
 * Migration: Backfill/rename legacy Stripe billing columns to Paddle.
 *
 * This keeps existing deployments safe while the application now uses:
 * - tenants.paddle_customer_id
 * - tenants.paddle_subscription_id
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
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'stripe_customer_id'
      ) THEN
        EXECUTE '
          UPDATE tenants
             SET paddle_customer_id = COALESCE(paddle_customer_id, stripe_customer_id)
           WHERE stripe_customer_id IS NOT NULL
        ';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'stripe_subscription_id'
      ) THEN
        EXECUTE '
          UPDATE tenants
             SET paddle_subscription_id = COALESCE(paddle_subscription_id, stripe_subscription_id)
           WHERE stripe_subscription_id IS NOT NULL
        ';
      END IF;
    END
    $$;
  `);

  pgm.sql(`
    ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_stripe_customer_id_unique,
    DROP CONSTRAINT IF EXISTS tenants_stripe_subscription_id_unique
  `);

  pgm.sql(`DROP INDEX IF EXISTS idx_tenants_stripe_customer`);

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

  pgm.createIndex('tenants', 'paddle_customer_id', {
    name: 'idx_tenants_paddle_customer',
    ifNotExists: true,
  });

  pgm.sql(`
    ALTER TABLE tenants
    DROP COLUMN IF EXISTS stripe_customer_id,
    DROP COLUMN IF EXISTS stripe_subscription_id
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT
  `);

  pgm.sql(`
    UPDATE tenants
       SET stripe_customer_id = COALESCE(stripe_customer_id, paddle_customer_id),
           stripe_subscription_id = COALESCE(stripe_subscription_id, paddle_subscription_id)
  `);

  pgm.sql(`
    ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_paddle_customer_id_unique,
    DROP CONSTRAINT IF EXISTS tenants_paddle_subscription_id_unique
  `);

  pgm.sql(`DROP INDEX IF EXISTS idx_tenants_paddle_customer`);

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

  pgm.createIndex('tenants', 'stripe_customer_id', {
    name: 'idx_tenants_stripe_customer',
    ifNotExists: true,
  });

  pgm.sql(`
    ALTER TABLE tenants
    DROP COLUMN IF EXISTS paddle_customer_id,
    DROP COLUMN IF EXISTS paddle_subscription_id
  `);
};
