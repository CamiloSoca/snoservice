-- Aggregate only shop retail sales for administration.
-- No public or barber access: the server invokes this only after admin session validation.
CREATE OR REPLACE FUNCTION public.retail_seller_breakdown(p_shop_id uuid)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO 'pg_catalog','public'
AS $fn$
WITH totals AS (
  SELECT
    s.barber_id,
    COUNT(*)::integer AS sale_count_total,
    COALESCE(SUM(s.quantity),0)::integer AS units_total,
    COALESCE(SUM(s.amount),0) AS amount_total,
    COUNT(*) FILTER (
      WHERE (s.sold_at AT TIME ZONE 'America/Montevideo') >=
        date_trunc('month',now() AT TIME ZONE 'America/Montevideo')
    )::integer AS sale_count_month,
    COALESCE(SUM(s.quantity) FILTER (
      WHERE (s.sold_at AT TIME ZONE 'America/Montevideo') >=
        date_trunc('month',now() AT TIME ZONE 'America/Montevideo')
    ),0)::integer AS units_month,
    COALESCE(SUM(s.amount) FILTER (
      WHERE (s.sold_at AT TIME ZONE 'America/Montevideo') >=
        date_trunc('month',now() AT TIME ZONE 'America/Montevideo')
    ),0) AS amount_month
  FROM public.retail_sales s
  WHERE s.shop_id=p_shop_id
  GROUP BY s.barber_id
),
sellers AS (
  -- Include every barber (including inactive ones) so prior sales remain auditable.
  SELECT b.id AS barber_id, b.name, false AS is_admin,
    COALESCE(t.sale_count_total,0) AS sale_count_total,
    COALESCE(t.units_total,0) AS units_total,
    COALESCE(t.amount_total,0) AS amount_total,
    COALESCE(t.sale_count_month,0) AS sale_count_month,
    COALESCE(t.units_month,0) AS units_month,
    COALESCE(t.amount_month,0) AS amount_month
  FROM public.barbers b
  LEFT JOIN totals t ON t.barber_id=b.id
  WHERE b.shop_id=p_shop_id
  UNION ALL
  -- Sales registered through admin have no barber_id.
  SELECT NULL::uuid,'Administración'::text,true,
    t.sale_count_total,t.units_total,t.amount_total,
    t.sale_count_month,t.units_month,t.amount_month
  FROM totals t
  WHERE t.barber_id IS NULL
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'barberId',barber_id,
  'name',name,
  'isAdmin',is_admin,
  'saleCountTotal',sale_count_total,
  'unitsTotal',units_total,
  'amountTotal',amount_total,
  'saleCountMonth',sale_count_month,
  'unitsMonth',units_month,
  'amountMonth',amount_month
) ORDER BY is_admin,name),'[]'::jsonb)
FROM sellers;
$fn$;

REVOKE ALL ON FUNCTION public.retail_seller_breakdown(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retail_seller_breakdown(uuid)
TO service_role;
