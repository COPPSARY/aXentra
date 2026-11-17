DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asset'
      AND column_name = 'barcode'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asset'
      AND column_name = 'asset_tag'
  ) THEN
    ALTER TABLE public.asset RENAME COLUMN barcode TO asset_tag;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT upper(btrim(asset_tag))
    FROM public.asset
    WHERE NULLIF(btrim(asset_tag), '') IS NOT NULL
    GROUP BY upper(btrim(asset_tag))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate asset tags: values differ only by case or surrounding spaces';
  END IF;
END
$$;

UPDATE public.asset
SET asset_tag = NULLIF(upper(btrim(asset_tag)), '')
WHERE asset_tag IS DISTINCT FROM NULLIF(upper(btrim(asset_tag)), '');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.asset'::regclass
      AND conname = 'asset_barcode_key'
  ) THEN
    ALTER TABLE public.asset
      RENAME CONSTRAINT asset_barcode_key TO asset_asset_tag_key;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.asset'::regclass
      AND conname = 'asset_asset_tag_key'
  ) THEN
    ALTER TABLE public.asset
      ADD CONSTRAINT asset_asset_tag_key UNIQUE (asset_tag);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_asset_barcode_trgm') IS NOT NULL
    AND to_regclass('public.idx_asset_asset_tag_trgm') IS NULL THEN
    ALTER INDEX public.idx_asset_barcode_trgm
      RENAME TO idx_asset_asset_tag_trgm;
  END IF;
END
$$;

ALTER TABLE public.asset
  DROP CONSTRAINT IF EXISTS asset_asset_tag_normalized;

ALTER TABLE public.asset
  ADD CONSTRAINT asset_asset_tag_normalized
  CHECK (
    asset_tag IS NULL
    OR (
      asset_tag = upper(btrim(asset_tag))
      AND btrim(asset_tag) <> ''
    )
  );

COMMENT ON COLUMN public.asset.asset_tag IS
  'Canonical asset tag encoded by both barcode and QR labels';

DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(
    to_regprocedure('public.search_location(text,bigint[],integer)')
  ) INTO definition;

  IF definition IS NOT NULL AND position('a.barcode' IN definition) > 0 THEN
    definition := replace(definition, 'a.barcode', 'a.asset_tag');
    definition := replace(definition, 'Barcode:', 'Asset tag:');
    EXECUTE definition;
  END IF;
END
$$;
