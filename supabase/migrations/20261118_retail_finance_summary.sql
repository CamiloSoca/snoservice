-- Efficient month-to-date retail income, separated by payment channel.
CREATE OR REPLACE FUNCTION public.retail_sales_summary(
 p_shop_id uuid,p_barber_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO 'pg_catalog','public'
AS $fn$
WITH sales AS (
 SELECT quantity,amount,payment_method,
   ((sold_at AT TIME ZONE 'America/Montevideo')::date >=
    date_trunc('month',(now() AT TIME ZONE 'America/Montevideo')::date)::date)
    AS current_month
 FROM public.retail_sales
 WHERE shop_id=p_shop_id AND (p_barber_id IS NULL OR barber_id=p_barber_id)
)
SELECT jsonb_build_object(
 'unitsTotal',COALESCE(sum(quantity),0),
 'amountTotal',COALESCE(sum(amount),0),
 'cashTotal',COALESCE(sum(amount) FILTER(WHERE payment_method='cash'),0),
 'transferTotal',COALESCE(sum(amount) FILTER(WHERE payment_method='transfer'),0),
 'unitsThisMonth',COALESCE(sum(quantity) FILTER(WHERE current_month),0),
 'amountThisMonth',COALESCE(sum(amount) FILTER(WHERE current_month),0),
 'cashThisMonth',COALESCE(sum(amount) FILTER(WHERE current_month AND payment_method='cash'),0),
 'transferThisMonth',COALESCE(sum(amount) FILTER(WHERE current_month AND payment_method='transfer'),0)
) FROM sales;
$fn$;
REVOKE ALL ON FUNCTION public.retail_sales_summary(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retail_sales_summary(uuid,uuid) TO service_role;
