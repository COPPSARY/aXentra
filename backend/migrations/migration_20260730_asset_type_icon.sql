-- Feature: store a per-asset-type icon identifier.
--
-- The value is an opaque display identifier owned by the client, for example
-- `lucide:laptop`. The backend only trims it; it never resolves it to an image.
--
-- Nullable with no default: existing rows keep NULL, which the API returns as
-- `icon: null`. VARCHAR(100) matches name / type_key on this table and the
-- 100-character limit the Joi validator already enforces.

ALTER TABLE public.asset_type
ADD COLUMN IF NOT EXISTS icon VARCHAR(100);
