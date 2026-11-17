-- search_location(): treat a NULL location list as "no location filter".
--
-- The backend passes NULL for a super admin (see LocationScope in
-- src/types/auth.ts) and an empty array for an admin with no assigned
-- location. Before this change every branch compared
-- `location_id = ANY(p_location_ids)`, which is never true for NULL, so a
-- super admin searching without choosing a location got no results.
--
-- An empty array still matches nothing, so an unassigned admin sees no rows.
-- Safe to re-run.

BEGIN;

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
