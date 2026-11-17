ALTER TABLE public.asset_type
ADD COLUMN IF NOT EXISTS grid_field_ids BIGINT[] NOT NULL DEFAULT '{}';
