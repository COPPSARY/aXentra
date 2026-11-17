-- =========================================
-- ENUM TYPES (idempotent)
-- =========================================

-- Create user_role enum if it does not already exist.
DO $$
BEGIN
  IF to_regtype('public.user_role') IS NULL THEN
      CREATE TYPE public.user_role AS ENUM ('admin', 'super_admin');
  END IF;
END $$;

-- Create auth_token_type enum if it does not already exist.
DO $$
BEGIN
  IF to_regtype('public.auth_token_type') IS NULL THEN
    CREATE TYPE public.auth_token_type AS ENUM ('reset', 'refresh');
  END IF;
END $$;

-- Create asset_field_type enum if it does not already exist.
DO $$
BEGIN
  IF to_regtype('public.asset_field_type') IS NULL THEN
    CREATE TYPE public.asset_field_type AS ENUM (
      'text',
      'number',
      'date',
      'boolean',
      'select'
    );
  END IF;
END $$;

-- Create asset_loan_status enum if it does not already exist.
DO $$
BEGIN
  IF to_regtype('public.asset_loan_status') IS NULL THEN
    CREATE TYPE public.asset_loan_status AS ENUM (
      'Active',
      'Returned',
      'Overdue',
      'Cancelled'
    );
  END IF;
END $$;

-- Create asset_loan_item_status enum if it does not already exist.
DO $$
BEGIN
  IF to_regtype('public.asset_loan_item_status') IS NULL THEN
    CREATE TYPE public.asset_loan_item_status AS ENUM (
      'Loaned',
      'Returned',
      'Lost',
      'Damaged',
      'Cancelled'
    );
  END IF;
END $$;

-- Create asset_status enum if it does not already exist.
DO $$
BEGIN
  IF to_regtype('public.asset_status') IS NULL THEN
    CREATE TYPE public.asset_status AS ENUM (
      'In Storage',
      'Loaned',
      'In Repair',
      'Damaged',
      'Lost',
      'Disposed'
    );
  END IF;
END $$;

-- Create software_license_status enum if it does not already exist.
DO $$
BEGIN
  IF to_regtype('public.software_license_status') IS NULL THEN
    CREATE TYPE public.software_license_status AS ENUM (
      'Unused',
      'Active',
      'Expired'
    );
  END IF;
END $$;

-- Create license_allocation_type enum if it does not already exist.
DO $$
BEGIN
  IF to_regtype('public.license_allocation_type') IS NULL THEN
    CREATE TYPE public.license_allocation_type AS ENUM (
      'single',
      'multi'
    );
  END IF;
END $$;


-- =========================================
-- UPDATED_AT TRIGGER FUNCTION
-- =========================================

-- Set updated_at automatically before row updates.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =========================================
-- 1) users
-- =========================================

-- Store application users and account metadata.
CREATE TABLE IF NOT EXISTS public.users (
  user_id         BIGSERIAL PRIMARY KEY,
  username        VARCHAR(100) NOT NULL UNIQUE,
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  email           VARCHAR(255) UNIQUE,
  password        TEXT NOT NULL,
  avatar_pic      TEXT,
  role            public.user_role NOT NULL DEFAULT 'admin',
  created_by      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

-- Speed up "who last edited this account" lookups.
CREATE INDEX IF NOT EXISTS idx_users_updated_by
  ON public.users(updated_by);

-- Recreate updated_at trigger for users table.
DROP TRIGGER IF EXISTS trg_users_set_updated_at ON public.users;
-- Create updated_at trigger for users table.
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 1.0) locations
-- =========================================

-- Store physical or logical locations.
CREATE TABLE IF NOT EXISTS public.locations (
  location_id      BIGSERIAL PRIMARY KEY,
  name             VARCHAR(150) NOT NULL,
  description      TEXT,
  address          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version          INTEGER NOT NULL DEFAULT 1,
  created_by       BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by       BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_name
  ON public.locations(name);

DROP TRIGGER IF EXISTS trg_locations_set_updated_at ON public.locations;
CREATE TRIGGER trg_locations_set_updated_at
BEFORE UPDATE ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 1.0.1) user_locations
-- =========================================

-- Assign admins to one or more locations.
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_location_id BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  location_id      BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by       BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT uq_user_locations_user_location UNIQUE (user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_user_locations_user_id
  ON public.user_locations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_locations_location_id
  ON public.user_locations(location_id);

CREATE INDEX IF NOT EXISTS idx_user_locations_updated_by
  ON public.user_locations(updated_by);

-- Recreate updated_at trigger for user location assignments.
DROP TRIGGER IF EXISTS trg_user_locations_updated_at ON public.user_locations;
CREATE TRIGGER trg_user_locations_updated_at
BEFORE UPDATE ON public.user_locations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 1.0.2) profile
-- =========================================

-- Store borrower/owner profiles scoped by location.
CREATE TABLE IF NOT EXISTS public.profile (
  profile_id       BIGSERIAL PRIMARY KEY,
  location_id      BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  full_name        VARCHAR(255) NOT NULL,
  phone            VARCHAR(50) NOT NULL,
  department       VARCHAR(255),
  remark           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version          INTEGER NOT NULL DEFAULT 1,
  created_by       BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by       BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_location_id
  ON public.profile(location_id);

CREATE INDEX IF NOT EXISTS idx_profile_full_name
  ON public.profile(full_name);

DROP TRIGGER IF EXISTS trg_profile_set_updated_at ON public.profile;
CREATE TRIGGER trg_profile_set_updated_at
BEFORE UPDATE ON public.profile
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 1.1) tokens
-- =========================================

-- Store hashed auth tokens (e.g., reset and refresh) by type.
CREATE TABLE IF NOT EXISTS public.tokens (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  token_type      public.auth_token_type NOT NULL DEFAULT 'reset',
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL
);

-- Speed up token audit lookups by actor.
CREATE INDEX IF NOT EXISTS idx_tokens_created_by
  ON public.tokens(created_by);

CREATE INDEX IF NOT EXISTS idx_tokens_updated_by
  ON public.tokens(updated_by);

-- Speed up token lookups by user.
CREATE INDEX IF NOT EXISTS idx_tokens_user_id
  ON public.tokens(user_id);

-- Speed up token cleanup by expiry.
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at
  ON public.tokens(expires_at);

-- Speed up active token lookups by user/type.
CREATE INDEX IF NOT EXISTS idx_tokens_user_type_active
  ON public.tokens(user_id, token_type, expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- Recreate updated_at trigger for tokens table.
DROP TRIGGER IF EXISTS trg_tokens_set_updated_at ON public.tokens;
CREATE TRIGGER trg_tokens_set_updated_at
BEFORE UPDATE ON public.tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 2) asset_type
-- =========================================

-- Define master list of asset categories.
CREATE TABLE IF NOT EXISTS public.asset_type (
  asset_type_id   BIGSERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  type_key        VARCHAR(100) NOT NULL,
  icon            VARCHAR(100),
  location_id     BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  grid_field_ids  BIGINT[] NOT NULL DEFAULT '{}'::BIGINT[],
  created_by      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_asset_type_location_id
  ON public.asset_type(location_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_type_name_location
  ON public.asset_type(name, location_id);

CREATE UNIQUE INDEX IF NOT EXISTS asset_type_type_key_location_id_key
  ON public.asset_type(type_key, location_id);

DROP TRIGGER IF EXISTS trg_asset_type_set_updated_at ON public.asset_type;
CREATE TRIGGER trg_asset_type_set_updated_at
BEFORE UPDATE ON public.asset_type
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 11) files
-- =========================================

-- Store file metadata.
CREATE TABLE IF NOT EXISTS public.files (
  file_id         BIGSERIAL PRIMARY KEY,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  file_label      VARCHAR(255),
  location_id     BIGINT REFERENCES public.locations(location_id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  images          JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT chk_files_images_is_array
    CHECK (jsonb_typeof(images) = 'array')
);

-- Speed up file queries by location.
CREATE INDEX IF NOT EXISTS idx_files_location_id ON public.files(location_id);

DROP TRIGGER IF EXISTS trg_files_set_updated_at ON public.files;
CREATE TRIGGER trg_files_set_updated_at
BEFORE UPDATE ON public.files
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 6) product
-- each product belongs to one asset type
-- each asset type can have many products
-- =========================================

-- Store products mapped to an asset type.
CREATE TABLE IF NOT EXISTS public.product (
  product_id       BIGSERIAL PRIMARY KEY,
  asset_type_id    BIGINT NOT NULL REFERENCES public.asset_type(asset_type_id) ON DELETE CASCADE,
  location_id      BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  product_name     VARCHAR(255) NOT NULL,
  manufacturer     VARCHAR(255),
  cost             NUMERIC(12,2) CHECK (cost IS NULL OR cost >= 0),
  updated_by       BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_by       BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version          INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_product_id_asset_type UNIQUE (product_id, asset_type_id),
  CONSTRAINT uq_product_name_asset_type_location
    UNIQUE (asset_type_id, location_id, product_name)
);

-- Speed up product filtering by asset type.
CREATE INDEX IF NOT EXISTS idx_product_asset_type_id ON public.product(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_product_location_id ON public.product(location_id);

DROP TRIGGER IF EXISTS trg_product_set_updated_at ON public.product;
CREATE TRIGGER trg_product_set_updated_at
BEFORE UPDATE ON public.product
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 3) asset
-- product_id is required
-- asset_type_id is required
-- product_id must belong to the same asset_type_id
-- =========================================

-- Store assets with optional product linkage and ownership.
CREATE TABLE IF NOT EXISTS public.asset (
  asset_id                  BIGSERIAL PRIMARY KEY,
  asset_name                VARCHAR(255) NOT NULL,
  product_id                BIGINT NOT NULL,
  asset_type_id             BIGINT NOT NULL REFERENCES public.asset_type(asset_type_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  location_id               BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  description               TEXT,
  remark                    TEXT,
  mac_address               VARCHAR(17),
  serial_number             VARCHAR(255) UNIQUE,
  asset_tag                 VARCHAR(255) UNIQUE,
  status                    public.asset_status NOT NULL DEFAULT 'In Storage',
  loanable                  BOOLEAN NOT NULL DEFAULT TRUE,
  warranty_expiry_date      DATE,
  loan_to_profile_id        BIGINT REFERENCES public.profile(profile_id) ON DELETE SET NULL,
  created_by                BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  file_id                   BIGINT REFERENCES public.files(file_id) ON DELETE SET NULL,
  display_image             TEXT,
  images                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  version                   INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT fk_asset_product_matches_type
    FOREIGN KEY (product_id, asset_type_id)
    REFERENCES public.product(product_id, asset_type_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT chk_asset_loanable_status
    CHECK (
      (status = 'In Storage' AND loanable IN (TRUE, FALSE))
      OR (status <> 'In Storage' AND loanable = FALSE)
    ),
  CONSTRAINT chk_asset_images_is_array
    CHECK (jsonb_typeof(images) = 'array')
);

-- Speed up asset filtering by asset type.
CREATE INDEX IF NOT EXISTS idx_asset_asset_type_id ON public.asset(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_asset_location_id ON public.asset(location_id);
-- Speed up asset filtering by product.
CREATE INDEX IF NOT EXISTS idx_asset_product_id ON public.asset(product_id);
-- Speed up asset filtering by loaned-to profile.
CREATE INDEX IF NOT EXISTS idx_asset_loan_to_profile_id ON public.asset(loan_to_profile_id);
-- Speed up asset filtering by creator.
CREATE INDEX IF NOT EXISTS idx_asset_created_by ON public.asset(created_by);
-- Speed up asset filtering by linked file.
CREATE INDEX IF NOT EXISTS idx_asset_file_id ON public.asset(file_id);
-- Speed up asset filtering by lifecycle status.
CREATE INDEX IF NOT EXISTS idx_asset_status ON public.asset(status);

-- Recreate updated_at trigger for asset table.
DROP TRIGGER IF EXISTS trg_asset_updated_at ON public.asset;
-- Create updated_at trigger for asset table.
CREATE TRIGGER trg_asset_updated_at
BEFORE UPDATE ON public.asset
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 4) asset_type_field
-- =========================================

-- Define custom fields available for each asset type.
CREATE TABLE IF NOT EXISTS public.asset_type_field (
  asset_type_field_id   BIGSERIAL PRIMARY KEY,
  asset_type_id         BIGINT NOT NULL REFERENCES public.asset_type(asset_type_id) ON DELETE CASCADE,
  location_id           BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  field_key             VARCHAR(100) NOT NULL,
  field_label           VARCHAR(255) NOT NULL,
  field_type            public.asset_field_type NOT NULL,
  is_required           BOOLEAN NOT NULL DEFAULT FALSE,
  options_json          JSONB,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version               INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT uq_asset_type_field_key_by_location
    UNIQUE (asset_type_id, location_id, field_key),
  CONSTRAINT chk_asset_type_field_options_json
    CHECK (options_json IS NULL OR jsonb_typeof(options_json) = 'array')
);

-- Speed up custom field lookups by asset type.
CREATE INDEX IF NOT EXISTS idx_asset_type_field_asset_type_id ON public.asset_type_field(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_asset_type_field_location_id ON public.asset_type_field(location_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_type_field_label_by_location_ci
  ON public.asset_type_field(asset_type_id, location_id, lower(btrim(field_label)));

DROP TRIGGER IF EXISTS trg_asset_type_field_set_updated_at ON public.asset_type_field;
CREATE TRIGGER trg_asset_type_field_set_updated_at
BEFORE UPDATE ON public.asset_type_field
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 5) asset_spec_value
-- one asset can only have one value per field
-- =========================================

-- Store typed custom field values for assets.
CREATE TABLE IF NOT EXISTS public.asset_spec_value (
  asset_spec_value_id   BIGSERIAL PRIMARY KEY,
  asset_id              BIGINT NOT NULL REFERENCES public.asset(asset_id) ON DELETE CASCADE,
  field_id              BIGINT NOT NULL REFERENCES public.asset_type_field(asset_type_field_id) ON DELETE CASCADE,
  value_text            TEXT,
  value_number          NUMERIC,
  value_date            DATE,
  value_boolean         BOOLEAN,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version               INTEGER NOT NULL DEFAULT 1,
  created_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,

  CONSTRAINT uq_asset_spec_value UNIQUE (asset_id, field_id),

  CONSTRAINT chk_asset_spec_one_value
    CHECK (
      ((CASE WHEN value_text IS NOT NULL THEN 1 ELSE 0 END) +
       (CASE WHEN value_number IS NOT NULL THEN 1 ELSE 0 END) +
       (CASE WHEN value_date IS NOT NULL THEN 1 ELSE 0 END) +
       (CASE WHEN value_boolean IS NOT NULL THEN 1 ELSE 0 END)) <= 1
    )
);

-- Speed up spec value lookups by asset.
CREATE INDEX IF NOT EXISTS idx_asset_spec_value_asset_id ON public.asset_spec_value(asset_id);
-- Speed up spec value lookups by field definition.
CREATE INDEX IF NOT EXISTS idx_asset_spec_value_field_id ON public.asset_spec_value(field_id);

-- Returns asset ids for one asset type that satisfy every requested dynamic field filter.
CREATE OR REPLACE FUNCTION public.match_asset_type_filter_ids(
  p_asset_type_id bigint,
  p_location_ids bigint[],
  p_filters jsonb
)
RETURNS TABLE (
  asset_id bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH filters AS (
    SELECT
      f.field_id,
      COALESCE(f.terms, ARRAY[]::text[]) AS terms,
      COALESCE(f.require_value, false) AS require_value
    FROM jsonb_to_recordset(COALESCE(p_filters, '[]'::jsonb))
      AS f(field_id bigint, terms text[], require_value boolean)
  ),
  matched AS (
    SELECT
      a.asset_id,
      f.field_id
    FROM public.asset a
    JOIN public.asset_spec_value sv
      ON sv.asset_id = a.asset_id
    JOIN filters f
      ON f.field_id = sv.field_id
    WHERE a.asset_type_id = p_asset_type_id
      AND (p_location_ids IS NULL OR a.location_id = ANY(p_location_ids))
      AND (
        (
          f.require_value = true
          AND (
            NULLIF(BTRIM(COALESCE(sv.value_text, '')), '') IS NOT NULL
            OR sv.value_number IS NOT NULL
            OR sv.value_date IS NOT NULL
            OR sv.value_boolean IS NOT NULL
          )
        )
        OR (
          cardinality(f.terms) > 0
          AND EXISTS (
            SELECT 1
            FROM unnest(f.terms) AS term(raw_term)
            CROSS JOIN LATERAL (
              SELECT LOWER(BTRIM(raw_term)) AS normalized_term
            ) normalized
            WHERE normalized.normalized_term <> ''
              AND (
                COALESCE(LOWER(sv.value_text), '') LIKE '%' || normalized.normalized_term || '%'
                OR COALESCE(sv.value_number::text, '') LIKE '%' || normalized.normalized_term || '%'
                OR COALESCE(sv.value_date::text, '') LIKE '%' || normalized.normalized_term || '%'
                OR COALESCE(
                  CASE
                    WHEN sv.value_boolean IS NULL THEN NULL
                    WHEN sv.value_boolean THEN 'true yes 1'
                    ELSE 'false no 0'
                  END,
                  ''
                ) LIKE '%' || normalized.normalized_term || '%'
              )
          )
        )
      )
  )
  SELECT m.asset_id
  FROM matched m
  GROUP BY m.asset_id
  HAVING COUNT(DISTINCT m.field_id) = (SELECT COUNT(*) FROM filters);
$$;

-- Recreate updated_at trigger for asset specification values.
DROP TRIGGER IF EXISTS trg_asset_spec_value_updated_at ON public.asset_spec_value;
-- Create updated_at trigger for asset specification values.
CREATE TRIGGER trg_asset_spec_value_updated_at
BEFORE UPDATE ON public.asset_spec_value
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 7) asset_loan
-- =========================================

-- Store asset loan transactions between users.
CREATE TABLE IF NOT EXISTS public.asset_loan (
  asset_loan_id         BIGSERIAL PRIMARY KEY,
  location_id           BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  borrower_profile_id   BIGINT NOT NULL REFERENCES public.profile(profile_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  lender_user_id        BIGINT NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  start_loan_date       DATE NOT NULL,
  end_loan_date         DATE NOT NULL,
  return_date           DATE,
  remark                TEXT,
  status                public.asset_loan_status NOT NULL DEFAULT 'Active',
  share_token           TEXT,
  share_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  version               INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT chk_asset_loan_dates
    CHECK (
      end_loan_date >= start_loan_date
      AND (return_date IS NULL OR return_date >= start_loan_date)
    )
);

-- Speed up location-scoped queries.
CREATE INDEX IF NOT EXISTS idx_asset_loan_location_id ON public.asset_loan(location_id);
-- Speed up loan lookups by borrower.
CREATE INDEX IF NOT EXISTS idx_asset_loan_borrower_profile_id ON public.asset_loan(borrower_profile_id);
-- Speed up loan lookups by lender.
CREATE INDEX IF NOT EXISTS idx_asset_loan_lender_user_id ON public.asset_loan(lender_user_id);
-- Speed up loan filtering by status.
CREATE INDEX IF NOT EXISTS idx_asset_loan_status ON public.asset_loan(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_loan_share_token
  ON public.asset_loan(share_token)
  WHERE share_token IS NOT NULL;

-- Recreate updated_at trigger for asset loans.
DROP TRIGGER IF EXISTS trg_asset_loan_updated_at ON public.asset_loan;
-- Create updated_at trigger for asset loans.
CREATE TRIGGER trg_asset_loan_updated_at
BEFORE UPDATE ON public.asset_loan
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 7a) asset_loan_extension_history
-- append-only due-date change log
-- =========================================

CREATE TABLE IF NOT EXISTS public.asset_loan_extension_history (
  asset_loan_extension_history_id BIGSERIAL PRIMARY KEY,
  asset_loan_id                   BIGINT NOT NULL REFERENCES public.asset_loan(asset_loan_id) ON DELETE CASCADE,
  previous_end_loan_date          DATE NOT NULL,
  new_end_loan_date               DATE NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by                      BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_loan_extension_history_loan_created_at
  ON public.asset_loan_extension_history(asset_loan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asset_loan_extension_history_updated_by
  ON public.asset_loan_extension_history(updated_by);

-- Recreate updated_at trigger for loan extension history.
DROP TRIGGER IF EXISTS trg_asset_loan_extension_history_updated_at
  ON public.asset_loan_extension_history;
CREATE TRIGGER trg_asset_loan_extension_history_updated_at
BEFORE UPDATE ON public.asset_loan_extension_history
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 8) asset_loan_item
-- each loan can contain multiple assets
-- =========================================

-- Store assets included in each loan record.
CREATE TABLE IF NOT EXISTS public.asset_loan_item (
  loan_item_id          BIGSERIAL PRIMARY KEY,
  asset_loan_id         BIGINT NOT NULL REFERENCES public.asset_loan(asset_loan_id) ON DELETE CASCADE,
  location_id           BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  asset_id              BIGINT NOT NULL REFERENCES public.asset(asset_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  item_status           public.asset_loan_item_status NOT NULL DEFAULT 'Loaned',
  return_date           DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  version               INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT uq_asset_loan_item UNIQUE (asset_loan_id, asset_id)
);

-- Speed up location-scoped queries on loan items.
CREATE INDEX IF NOT EXISTS idx_asset_loan_item_location_id ON public.asset_loan_item(location_id);
-- Speed up loan item lookups by parent loan.
CREATE INDEX IF NOT EXISTS idx_asset_loan_item_asset_loan_id ON public.asset_loan_item(asset_loan_id);
-- Speed up loan item lookups by asset.
CREATE INDEX IF NOT EXISTS idx_asset_loan_item_asset_id ON public.asset_loan_item(asset_id);

-- Recreate updated_at trigger for loan items.
DROP TRIGGER IF EXISTS trg_asset_loan_item_updated_at ON public.asset_loan_item;
-- Create updated_at trigger for loan items. Without this the column stays frozen
-- at insert time, because the repository update path does not write it.
CREATE TRIGGER trg_asset_loan_item_updated_at
BEFORE UPDATE ON public.asset_loan_item
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 9) software_license
-- one license can be assigned to multiple computers
-- controlled by allocation_type + allocation_limit
-- =========================================

-- Store software license inventory and assignment policy.
CREATE TABLE IF NOT EXISTS public.software_license (
  software_license_id   BIGSERIAL PRIMARY KEY,
  software_name         VARCHAR(255) NOT NULL,
  software_version      VARCHAR(100),
  license_key           TEXT,
  purchase_date         DATE,
  expiry_date           DATE,
  location_id           BIGINT NOT NULL REFERENCES public.locations(location_id) ON DELETE CASCADE,
  status                public.software_license_status NOT NULL DEFAULT 'Unused',
  description           TEXT,
  file_id               BIGINT REFERENCES public.files(file_id) ON DELETE SET NULL,
  images                JSONB NOT NULL DEFAULT '[]'::jsonb,
  allocation_type       public.license_allocation_type NOT NULL DEFAULT 'single',
  allocation_limit      INTEGER,
  created_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  version               INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT chk_software_license_dates
    CHECK (
      expiry_date IS NULL
      OR purchase_date IS NULL
      OR expiry_date >= purchase_date
    ),
  CONSTRAINT chk_software_license_assignment
    CHECK (
      (allocation_type = 'single' AND (allocation_limit IS NULL OR allocation_limit = 1))
      OR (allocation_type = 'multi' AND allocation_limit IS NOT NULL AND allocation_limit BETWEEN 1 AND 255)
    ),
  CONSTRAINT chk_software_license_images_is_array
    CHECK (jsonb_typeof(images) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_software_license_location_id ON public.software_license(location_id);
-- Speed up software license lookups by linked file.
CREATE INDEX IF NOT EXISTS idx_software_license_file_id ON public.software_license(file_id);
-- Speed up software license filtering by status.
CREATE INDEX IF NOT EXISTS idx_software_license_status ON public.software_license(status);

-- Recreate updated_at trigger for software licenses.
DROP TRIGGER IF EXISTS trg_software_license_updated_at ON public.software_license;
-- Create updated_at trigger for software licenses.
CREATE TRIGGER trg_software_license_updated_at
BEFORE UPDATE ON public.software_license
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 10) license_link_asset
-- assignment table between software_license and asset
-- =========================================

-- Store license-to-asset assignment history.
CREATE TABLE IF NOT EXISTS public.license_link_asset (
  license_link_asset_id   BIGSERIAL PRIMARY KEY,
  asset_id                BIGINT NOT NULL REFERENCES public.asset(asset_id) ON DELETE CASCADE,
  software_license_id     BIGINT NOT NULL REFERENCES public.software_license(software_license_id) ON DELETE CASCADE,
  assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_by              BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,

  CONSTRAINT chk_license_link_dates
    CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

-- Speed up assignment lookups by asset.
CREATE INDEX IF NOT EXISTS idx_license_link_asset_asset_id ON public.license_link_asset(asset_id);
-- Speed up assignment lookups by software license.
CREATE INDEX IF NOT EXISTS idx_license_link_asset_license_id ON public.license_link_asset(software_license_id);

-- prevent duplicate active assignment of the same license to the same asset
CREATE UNIQUE INDEX IF NOT EXISTS uq_license_link_asset_active_pair
ON public.license_link_asset(asset_id, software_license_id)
WHERE unassigned_at IS NULL;

DROP TRIGGER IF EXISTS trg_license_link_asset_updated_at ON public.license_link_asset;
CREATE TRIGGER trg_license_link_asset_updated_at
BEFORE UPDATE ON public.license_link_asset
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 11) activity_log
-- append-only audit trail powering the recent-activity feed
-- =========================================

-- Store one immutable entry per mutating operation. Deliberately has no
-- updated_at / updated_by / version column and no set_updated_at trigger: rows
-- are inserted once and never modified, so this table does not participate in
-- optimistic locking. entity_label, location_name and actor_name are snapshots
-- taken at write time so an entry still renders after the referenced row or
-- acting user is deleted. entity_type and action are TEXT, with the allowed
-- values held in src/utils/constants.js and enforced at the service layer, so
-- new audit actions do not require a production migration.
CREATE TABLE IF NOT EXISTS public.activity_log (
  activity_log_id  BIGSERIAL PRIMARY KEY,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entity_type      TEXT        NOT NULL,
  entity_id        BIGINT,
  entity_label     TEXT        NOT NULL,
  action           TEXT        NOT NULL,
  status           TEXT,
  location_id      BIGINT REFERENCES public.locations(location_id) ON DELETE SET NULL,
  location_name    TEXT,
  actor_user_id    BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  actor_name       TEXT        NOT NULL,
  metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT chk_activity_log_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

-- Primary feed order: newest first, id as a stable tiebreaker.
CREATE INDEX IF NOT EXISTS idx_activity_log_occurred_at
  ON public.activity_log(occurred_at DESC, activity_log_id DESC);
-- Location-scoped feed for admins and the dashboard recentActivities block.
CREATE INDEX IF NOT EXISTS idx_activity_log_location_occurred_at
  ON public.activity_log(location_id, occurred_at DESC);
-- Per-record history lookups.
CREATE INDEX IF NOT EXISTS idx_activity_log_entity
  ON public.activity_log(entity_type, entity_id, occurred_at DESC);
-- "What did this user change?"
CREATE INDEX IF NOT EXISTS idx_activity_log_actor
  ON public.activity_log(actor_user_id, occurred_at DESC);
-- entity_type filtering and the dashboard's NOT IN ('auth') exclusion.
CREATE INDEX IF NOT EXISTS idx_activity_log_entity_type_occurred_at
  ON public.activity_log(entity_type, occurred_at DESC);


-- Adds the pg_trgm extension, GIN trigram indexes on the searchable text columns,
-- and a single search_location() RPC that ranks matches across every resource
-- in a set of allowed locations by trigram similarity.

BEGIN;


CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================================
-- GIN trigram indexes on searched columns
-- =========================================

-- asset
CREATE INDEX IF NOT EXISTS idx_asset_name_trgm
  ON public.asset USING gin (asset_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_asset_serial_number_trgm
  ON public.asset USING gin (serial_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_asset_asset_tag_trgm
  ON public.asset USING gin (asset_tag gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_asset_mac_address_trgm
  ON public.asset USING gin (mac_address gin_trgm_ops);

-- profile
CREATE INDEX IF NOT EXISTS idx_profile_full_name_trgm
  ON public.profile USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profile_phone_trgm
  ON public.profile USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profile_department_trgm
  ON public.profile USING gin (department gin_trgm_ops);

-- product
CREATE INDEX IF NOT EXISTS idx_product_product_name_trgm
  ON public.product USING gin (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_product_manufacturer_trgm
  ON public.product USING gin (manufacturer gin_trgm_ops);

-- software_license
CREATE INDEX IF NOT EXISTS idx_software_license_software_name_trgm
  ON public.software_license USING gin (software_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_software_license_software_version_trgm
  ON public.software_license USING gin (software_version gin_trgm_ops);

-- asset_type
CREATE INDEX IF NOT EXISTS idx_asset_type_name_trgm
  ON public.asset_type USING gin (name gin_trgm_ops);

-- files
CREATE INDEX IF NOT EXISTS idx_files_file_label_trgm
  ON public.files USING gin (file_label gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_files_description_trgm
  ON public.files USING gin (description gin_trgm_ops);

-- =========================================
-- search_location() RPC
-- =========================================
-- Ranks fuzzy matches across every resource within p_location_ids.
-- A NULL list means "no location filter" (super admin); an empty array matches nothing.

CREATE OR REPLACE FUNCTION public.search_location(
  p_query        text,
  p_location_ids bigint[],
  p_limit        integer DEFAULT 10
)
RETURNS TABLE (
  resource text,
  id       bigint,
  label    text,
  subtitle text,
  score    real
)
LANGUAGE sql
STABLE
AS $$
  SELECT u.resource, u.id, u.label, u.subtitle, u.score
  FROM (
  (
    SELECT
      'assets'::text AS resource,
      a.asset_id     AS id,
      a.asset_name   AS label,
      NULLIF(
        concat_ws(' · ',
          NULLIF('SN: ' || a.serial_number, 'SN: '),
          NULLIF('Asset tag: ' || a.asset_tag, 'Asset tag: ')
        ),
        ''
      ) AS subtitle,
      GREATEST(
        word_similarity(p_query, a.asset_name),
        word_similarity(p_query, COALESCE(a.serial_number, '')),
        word_similarity(p_query, COALESCE(a.asset_tag, '')),
        word_similarity(p_query, COALESCE(a.mac_address, ''))
      ) AS score
    FROM public.asset a
    WHERE (p_location_ids IS NULL OR a.location_id = ANY(p_location_ids))
      AND (
        p_query <% a.asset_name
        OR p_query <% a.serial_number
        OR p_query <% a.asset_tag
        OR p_query <% a.mac_address
      )
    ORDER BY score DESC
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT
      'profiles'::text AS resource,
      p.profile_id     AS id,
      p.full_name      AS label,
      NULLIF(concat_ws(' · ', p.department, p.phone), '') AS subtitle,
      GREATEST(
        word_similarity(p_query, p.full_name),
        word_similarity(p_query, COALESCE(p.phone, '')),
        word_similarity(p_query, COALESCE(p.department, ''))
      ) AS score
    FROM public.profile p
    WHERE (p_location_ids IS NULL OR p.location_id = ANY(p_location_ids))
      AND (
        p_query <% p.full_name
        OR p_query <% p.phone
        OR p_query <% p.department
      )
    ORDER BY score DESC
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT
      'products'::text AS resource,
      pr.product_id    AS id,
      pr.product_name  AS label,
      pr.manufacturer  AS subtitle,
      GREATEST(
        word_similarity(p_query, pr.product_name),
        word_similarity(p_query, COALESCE(pr.manufacturer, ''))
      ) AS score
    FROM public.product pr
    WHERE (p_location_ids IS NULL OR pr.location_id = ANY(p_location_ids))
      AND (
        p_query <% pr.product_name
        OR p_query <% pr.manufacturer
      )
    ORDER BY score DESC
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT
      'licenses'::text       AS resource,
      sl.software_license_id AS id,
      sl.software_name       AS label,
      sl.software_version    AS subtitle,
      GREATEST(
        word_similarity(p_query, sl.software_name),
        word_similarity(p_query, COALESCE(sl.software_version, ''))
      ) AS score
    FROM public.software_license sl
    WHERE (p_location_ids IS NULL OR sl.location_id = ANY(p_location_ids))
      AND (
        p_query <% sl.software_name
        OR p_query <% sl.software_version
      )
    ORDER BY score DESC
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT
      'assetTypes'::text AS resource,
      at.asset_type_id   AS id,
      at.name            AS label,
      at.type_key        AS subtitle,
      word_similarity(p_query, at.name) AS score
    FROM public.asset_type at
    WHERE (p_location_ids IS NULL OR at.location_id = ANY(p_location_ids))
      AND p_query <% at.name
    ORDER BY score DESC
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT
      'files'::text AS resource,
      f.file_id     AS id,
      COALESCE(f.file_label, 'File #' || f.file_id::text) AS label,
      f.description AS subtitle,
      GREATEST(
        word_similarity(p_query, COALESCE(f.file_label, '')),
        word_similarity(p_query, COALESCE(f.description, ''))
      ) AS score
    FROM public.files f
    WHERE (p_location_ids IS NULL OR f.location_id = ANY(p_location_ids))
      AND (
        p_query <% f.file_label
        OR p_query <% f.description
      )
    ORDER BY score DESC
    LIMIT p_limit
  )
  ) AS u
  ORDER BY u.score DESC
  LIMIT p_limit;
$$;

COMMIT;
