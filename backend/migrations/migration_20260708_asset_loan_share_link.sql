-- Feature: loan public share link

ALTER TABLE public.asset_loan
ADD COLUMN IF NOT EXISTS share_token TEXT;

ALTER TABLE public.asset_loan
ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN DEFAULT FALSE;

UPDATE public.asset_loan  
SET share_enabled = FALSE
WHERE share_enabled IS NULL;

ALTER TABLE public.asset_loan
ALTER COLUMN share_enabled SET DEFAULT FALSE;

ALTER TABLE public.asset_loan
ALTER COLUMN share_enabled SET NOT NULL;

DROP INDEX IF EXISTS uq_asset_loan_share_token_hash;

ALTER TABLE public.asset_loan
DROP COLUMN IF EXISTS share_token_hash;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_loan_share_token
  ON public.asset_loan(share_token)
  WHERE share_token IS NOT NULL;
