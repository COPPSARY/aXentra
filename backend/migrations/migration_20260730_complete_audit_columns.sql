-- Feature: complete the created_by / updated_by / created_at / updated_at audit
-- column set on the four tables that were missing part of it.
--
--   users                        + updated_by
--   user_locations               + updated_at, updated_by
--   tokens                       + created_by, updated_by
--   asset_loan_extension_history + updated_at, updated_by
--
-- public.activity_log is intentionally excluded: it is append-only and uses
-- occurred_at / actor_user_id instead. Adding updated_at / updated_by there
-- would contradict the guarantee that audit rows are never modified.
--
-- Notes:
--   * All *_by columns are BIGINT REFERENCES public.users(user_id) ON DELETE
--     SET NULL. Never CASCADE: deleting a user must not delete the rows they
--     touched. On users.updated_by this is a self-referencing FK, so SET NULL
--     also prevents a delete from cascading across every account they edited.
--   * New updated_at columns are added nullable, backfilled from created_at,
--     then set NOT NULL. Defaulting straight to NOW() would claim every
--     pre-existing row was modified at migration time.
--   * user_locations and asset_loan_extension_history gain a set_updated_at
--     trigger, since they did not have one before.

-- =========================================
-- 1) users.updated_by
-- =========================================

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS updated_by BIGINT
  REFERENCES public.users(user_id)
  ON DELETE SET NULL;

-- Track who last edited an account. Left NULL for rows that predate this
-- column: attributing them to created_by would be a guess.
CREATE INDEX IF NOT EXISTS idx_users_updated_by
  ON public.users(updated_by);


-- =========================================
-- 2) user_locations.updated_at, user_locations.updated_by
-- =========================================

ALTER TABLE public.user_locations
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.user_locations
ADD COLUMN IF NOT EXISTS updated_by BIGINT
  REFERENCES public.users(user_id)
  ON DELETE SET NULL;

UPDATE public.user_locations
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE public.user_locations
ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.user_locations
ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_locations_updated_by
  ON public.user_locations(updated_by);

DROP TRIGGER IF EXISTS trg_user_locations_updated_at ON public.user_locations;
CREATE TRIGGER trg_user_locations_updated_at
BEFORE UPDATE ON public.user_locations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 3) tokens.created_by, tokens.updated_by
-- =========================================

ALTER TABLE public.tokens
ADD COLUMN IF NOT EXISTS created_by BIGINT
  REFERENCES public.users(user_id)
  ON DELETE SET NULL;

ALTER TABLE public.tokens
ADD COLUMN IF NOT EXISTS updated_by BIGINT
  REFERENCES public.users(user_id)
  ON DELETE SET NULL;

-- Every existing token was issued by the login / forgot-password action of the
-- user it belongs to, so user_id is the correct actor for the backfill.
UPDATE public.tokens
SET created_by = user_id
WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_tokens_created_by
  ON public.tokens(created_by);

CREATE INDEX IF NOT EXISTS idx_tokens_updated_by
  ON public.tokens(updated_by);


-- =========================================
-- 4) asset_loan_extension_history.updated_at, .updated_by
-- =========================================

ALTER TABLE public.asset_loan_extension_history
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.asset_loan_extension_history
ADD COLUMN IF NOT EXISTS updated_by BIGINT
  REFERENCES public.users(user_id)
  ON DELETE SET NULL;

UPDATE public.asset_loan_extension_history
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE public.asset_loan_extension_history
ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.asset_loan_extension_history
ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_loan_extension_history_updated_by
  ON public.asset_loan_extension_history(updated_by);

DROP TRIGGER IF EXISTS trg_asset_loan_extension_history_updated_at
  ON public.asset_loan_extension_history;
CREATE TRIGGER trg_asset_loan_extension_history_updated_at
BEFORE UPDATE ON public.asset_loan_extension_history
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- =========================================
-- 5) asset_loan_item: repair a stale updated_at
-- =========================================
-- Pre-existing defect, found while auditing the other four tables.
-- asset_loan_item already had all four audit columns, but it was the only table
-- with an updated_at and no set_updated_at trigger, and neither
-- assetLoanItemRepository.update nor AssetLoanItem ever wrote the column. Every
-- item status change (Returned / Lost / Damaged / Cancelled) therefore left
-- updated_at frozen at insert time while updated_by advanced correctly.
--
-- Adding the trigger brings it in line with the other 12 tables. Existing rows
-- keep their stale value: the correct timestamp was never recorded, so it cannot
-- be recovered, and guessing it would be worse than leaving it visibly equal to
-- created_at.
DROP TRIGGER IF EXISTS trg_asset_loan_item_updated_at ON public.asset_loan_item;
CREATE TRIGGER trg_asset_loan_item_updated_at
BEFORE UPDATE ON public.asset_loan_item
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
