-- Feature: append-only activity_log audit table for the "recent activity" feed.
--
-- Replaces the old approach of inferring activity from created_at / created_by /
-- updated_at / updated_by across seven tables. That approach could not report
-- deletions, collapsed repeated edits into one entry, flattened every business
-- action into "created"/"updated", and cost a full scan per dashboard load.
--
-- Design notes:
--   * Append-only. No updated_at, no updated_by, no version column, and no
--     set_updated_at trigger: rows are inserted once and never modified, so
--     optimistic locking does not apply.
--   * entity_label, location_name and actor_name are denormalized snapshots
--     taken at write time. A delete entry must still say what was deleted, and
--     must still render after the acting user or the location row is gone.
--   * entity_type and action are TEXT rather than Postgres enums. Audit
--     vocabularies grow often and every new action would otherwise need a
--     migration against production; the allowed values live in
--     src/utils/constants.js (ACTIVITY_ENTITY_TYPES / ACTIVITY_ACTIONS) and are
--     enforced by the Joi validator and the service layer.
--   * Foreign keys use ON DELETE SET NULL, never CASCADE: deleting a user or a
--     location must not erase the audit trail of what they did.

CREATE TABLE IF NOT EXISTS public.activity_log (
  activity_log_id  BIGSERIAL PRIMARY KEY,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entity_type      TEXT        NOT NULL,
  entity_id        BIGINT,
  entity_label     TEXT        NOT NULL,
  action           TEXT        NOT NULL,
  status           TEXT,
  location_id      BIGINT
    REFERENCES public.locations(location_id)
    ON DELETE SET NULL,
  location_name    TEXT,
  actor_user_id    BIGINT
    REFERENCES public.users(user_id)
    ON DELETE SET NULL,
  actor_name       TEXT        NOT NULL,
  metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- metadata is always a JSON object so `metadata->>'key'` reads are safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_activity_log_metadata_is_object'
      AND conrelid = 'public.activity_log'::regclass
  ) THEN
    ALTER TABLE public.activity_log
    ADD CONSTRAINT chk_activity_log_metadata_is_object
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;
END $$;

-- Primary feed order: newest first, with the id as a stable tiebreaker.
CREATE INDEX IF NOT EXISTS idx_activity_log_occurred_at
  ON public.activity_log(occurred_at DESC, activity_log_id DESC);

-- Location-scoped feed for admins, and the dashboard's recentActivities block.
CREATE INDEX IF NOT EXISTS idx_activity_log_location_occurred_at
  ON public.activity_log(location_id, occurred_at DESC);

-- Per-record history: GET /api/activity?entityType=asset&entityId=12
CREATE INDEX IF NOT EXISTS idx_activity_log_entity
  ON public.activity_log(entity_type, entity_id, occurred_at DESC);

-- "What did this user change?"
CREATE INDEX IF NOT EXISTS idx_activity_log_actor
  ON public.activity_log(actor_user_id, occurred_at DESC);

-- Supports the entity_type filter and the dashboard's NOT IN ('auth') exclusion.
CREATE INDEX IF NOT EXISTS idx_activity_log_entity_type_occurred_at
  ON public.activity_log(entity_type, occurred_at DESC);


-- =========================================
-- Realtime
-- =========================================
-- activity_log has an entry in src/services/realtime/tableConfig.js, so it must
-- be part of the replication publication or its SSE events are never emitted.
-- Safe to re-run: skipped when the table is already in the publication.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'activity_log'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
    END IF;
  END IF;
END $$;


-- =========================================
-- Optional one-off backfill
-- =========================================
-- Seeds the feed from the audit columns that used to drive it, so the dashboard
-- is not empty on day one. This is the only place those columns are still read.
-- Rows are tagged metadata->>'source' = 'backfill' so synthesized entries can be
-- told apart from real ones (and deleted again if desired).
--
-- Uncomment to run. Guarded so re-running does not duplicate rows.
--
-- INSERT INTO public.activity_log (
--   occurred_at, entity_type, entity_id, entity_label, action, status,
--   location_id, location_name, actor_user_id, actor_name, metadata
-- )
-- SELECT
--   COALESCE(src.updated_at, src.created_at),
--   src.entity_type,
--   src.entity_id,
--   src.entity_label,
--   CASE
--     WHEN src.updated_at IS NOT NULL AND src.updated_at <> src.created_at
--       THEN 'updated'
--     ELSE 'created'
--   END,
--   src.status,
--   src.location_id,
--   loc.name,
--   COALESCE(src.updated_by, src.created_by),
--   COALESCE(
--     NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
--     u.username,
--     'System'
--   ),
--   jsonb_build_object('source', 'backfill')
-- FROM (
--   SELECT 'asset' AS entity_type, a.asset_id AS entity_id, a.asset_name AS entity_label,
--          a.status::TEXT AS status, a.location_id, a.created_at, a.updated_at,
--          a.created_by, a.updated_by
--   FROM public.asset a
--   UNION ALL
--   SELECT 'asset_loan', l.asset_loan_id, CONCAT('Loan #', l.asset_loan_id),
--          l.status::TEXT, l.location_id, l.created_at, l.updated_at,
--          l.created_by, l.updated_by
--   FROM public.asset_loan l
--   UNION ALL
--   SELECT 'software_license', s.software_license_id, s.software_name,
--          s.status::TEXT, s.location_id, s.created_at, s.updated_at,
--          s.created_by, s.updated_by
--   FROM public.software_license s
--   UNION ALL
--   SELECT 'asset_type', t.asset_type_id, t.name,
--          NULL, t.location_id, t.created_at, t.updated_at,
--          t.created_by, t.updated_by
--   FROM public.asset_type t
--   UNION ALL
--   SELECT 'product', p.product_id, p.product_name,
--          NULL, p.location_id, p.created_at, p.updated_at,
--          p.created_by, p.updated_by
--   FROM public.product p
--   UNION ALL
--   SELECT 'profile', pr.profile_id, pr.full_name,
--          NULL, pr.location_id, pr.created_at, pr.updated_at,
--          pr.created_by, pr.updated_by
--   FROM public.profile pr
--   UNION ALL
--   SELECT 'file', f.file_id, COALESCE(f.file_label, CONCAT('File #', f.file_id)),
--          NULL, f.location_id, f.created_at, f.updated_at,
--          f.created_by, f.updated_by
--   FROM public.files f
--   UNION ALL
--   SELECT 'location', lo.location_id, lo.name,
--          NULL, lo.location_id, lo.created_at, lo.updated_at,
--          lo.created_by, lo.updated_by
--   FROM public.locations lo
-- ) AS src
-- LEFT JOIN public.locations loc ON loc.location_id = src.location_id
-- LEFT JOIN public.users u ON u.user_id = COALESCE(src.updated_by, src.created_by)
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.activity_log existing
--   WHERE existing.metadata->>'source' = 'backfill'
-- );
