-- 13 CUT: stock and cash sales for hair styling products, independently of services.
-- No barber commission, no online checkout. Initial physical stock is deliberately zero.
CREATE TABLE IF NOT EXISTS public.retail_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL CHECK(price > 0 AND price=round(price,2)),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shop_id,slug)
);
CREATE TABLE IF NOT EXISTS public.retail_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  product_id uuid NOT NULL REFERENCES public.retail_products(id),
  register_id uuid NOT NULL REFERENCES public.cash_registers(id),
  barber_id uuid REFERENCES public.barbers(id),
  actor_role text NOT NULL CHECK(actor_role IN ('admin','barber')),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  unit_price numeric NOT NULL CHECK(unit_price > 0),
  amount numeric NOT NULL CHECK(amount > 0),
  payment_method text NOT NULL CHECK(payment_method IN ('cash','transfer')),
  barber_commission numeric NOT NULL DEFAULT 0 CHECK(barber_commission=0),
  sold_at timestamptz NOT NULL DEFAULT now(),
  CHECK((actor_role='admin' AND barber_id IS NULL) OR (actor_role='barber' AND barber_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_retail_sales_shop_date ON public.retail_sales(shop_id,sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_retail_sales_barber_date ON public.retail_sales(shop_id,barber_id,sold_at DESC);
CREATE TABLE IF NOT EXISTS public.retail_stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  product_id uuid NOT NULL REFERENCES public.retail_products(id),
  previous_stock integer NOT NULL CHECK(previous_stock >= 0),
  new_stock integer NOT NULL CHECK(new_stock >= 0),
  note text NOT NULL CHECK(length(note) BETWEEN 3 AND 240),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retail_adjustments_shop ON public.retail_stock_adjustments(shop_id,created_at DESC);

ALTER TABLE public.retail_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_stock_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retail_products,public.retail_sales,public.retail_stock_adjustments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.retail_products TO service_role;
GRANT SELECT,INSERT ON public.retail_sales,public.retail_stock_adjustments TO service_role;

-- Completed sales and stock audit history cannot be silently changed or removed.
CREATE OR REPLACE FUNCTION public.block_retail_history_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'Las ventas y los ajustes de stock son históricos; requieren conciliación supervisada'
    USING ERRCODE='23514';
END; $fn$;
REVOKE ALL ON FUNCTION public.block_retail_history_mutation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_retail_sale_immutable ON public.retail_sales;
CREATE TRIGGER trg_retail_sale_immutable BEFORE UPDATE OR DELETE ON public.retail_sales
FOR EACH ROW EXECUTE FUNCTION public.block_retail_history_mutation();
DROP TRIGGER IF EXISTS trg_retail_stock_adjustment_immutable ON public.retail_stock_adjustments;
CREATE TRIGGER trg_retail_stock_adjustment_immutable BEFORE UPDATE OR DELETE ON public.retail_stock_adjustments
FOR EACH ROW EXECUTE FUNCTION public.block_retail_history_mutation();

-- Atomic stock deduction + income record. A repeat request returns the original sale.
CREATE OR REPLACE FUNCTION public.record_retail_sale(
  p_shop_id uuid,p_product_id uuid,p_barber_id uuid,p_actor_role text,
  p_quantity integer,p_payment_method text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_product public.retail_products%ROWTYPE;
        v_prior public.retail_sales%ROWTYPE;
        v_register uuid;
        v_sale public.retail_sales%ROWTYPE;
BEGIN
  IF p_shop_id IS NULL OR p_product_id IS NULL OR p_request_id IS NULL
    OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 20
    OR p_payment_method IS NULL OR p_payment_method NOT IN ('cash','transfer')
    OR p_actor_role IS NULL OR p_actor_role NOT IN ('barber','admin')
    OR (p_actor_role='barber' AND p_barber_id IS NULL)
    OR (p_actor_role='admin' AND p_barber_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Datos de venta inválidos' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_product FROM public.retail_products
    WHERE id=p_product_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible' USING ERRCODE='23514'; END IF;

  SELECT * INTO v_prior FROM public.retail_sales
    WHERE shop_id=p_shop_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_prior.product_id IS DISTINCT FROM p_product_id
      OR v_prior.barber_id IS DISTINCT FROM p_barber_id
      OR v_prior.actor_role<>p_actor_role
      OR v_prior.quantity<>p_quantity
      OR v_prior.payment_method<>p_payment_method THEN
      RAISE EXCEPTION 'Identificador reutilizado para otra venta' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_prior.id,'repeated',true,
      'amount',v_prior.amount,'quantity',v_prior.quantity,
      'stockRemaining',v_product.stock_quantity);
  END IF;

  IF NOT v_product.active OR v_product.stock_quantity<p_quantity THEN
    RAISE EXCEPTION 'No hay stock suficiente para registrar esta venta' USING ERRCODE='23514';
  END IF;
  IF p_actor_role='barber' AND NOT EXISTS (
    SELECT 1 FROM public.barbers b
    WHERE b.id=p_barber_id AND b.shop_id=p_shop_id AND b.active=true
  ) THEN RAISE EXCEPTION 'Barbero no autorizado' USING ERRCODE='23514'; END IF;
  v_register:=public.cash_register_for_finance(p_shop_id);
  UPDATE public.retail_products
    SET stock_quantity=stock_quantity-p_quantity
    WHERE id=v_product.id AND shop_id=p_shop_id AND stock_quantity>=p_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock agotado' USING ERRCODE='23514'; END IF;
  INSERT INTO public.retail_sales(
    request_id,shop_id,product_id,register_id,barber_id,actor_role,
    quantity,unit_price,amount,payment_method,barber_commission
  ) VALUES(
    p_request_id,p_shop_id,p_product_id,v_register,p_barber_id,p_actor_role,
    p_quantity,v_product.price,round(p_quantity*v_product.price,2),
    p_payment_method,0
  ) RETURNING * INTO v_sale;
  RETURN jsonb_build_object('id',v_sale.id,'repeated',false,'amount',v_sale.amount,
    'quantity',v_sale.quantity,'stockRemaining',v_product.stock_quantity-p_quantity);
END; $fn$;
REVOKE ALL ON FUNCTION public.record_retail_sale(uuid,uuid,uuid,text,integer,text,uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_retail_sale(uuid,uuid,uuid,text,integer,text,uuid)
TO service_role;

-- Administrative stock count; every change records an immutable before/after row.
CREATE OR REPLACE FUNCTION public.set_retail_stock(
  p_shop_id uuid,p_product_id uuid,p_new_stock integer,p_note text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_product public.retail_products%ROWTYPE;
        v_prior public.retail_stock_adjustments%ROWTYPE;
BEGIN
 IF p_shop_id IS NULL OR p_product_id IS NULL OR p_request_id IS NULL
    OR p_new_stock IS NULL OR p_new_stock NOT BETWEEN 0 AND 100000
    OR length(trim(coalesce(p_note,''))) NOT BETWEEN 3 AND 240
 THEN RAISE EXCEPTION 'Datos de stock inválidos' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_product FROM public.retail_products
 WHERE id=p_product_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto inexistente' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_prior FROM public.retail_stock_adjustments
 WHERE shop_id=p_shop_id AND request_id=p_request_id;
 IF FOUND THEN
   IF v_prior.product_id IS DISTINCT FROM p_product_id OR
     v_prior.new_stock<>p_new_stock OR v_prior.note<>trim(p_note) THEN
     RAISE EXCEPTION 'Identificador reutilizado para otro ajuste' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('id',v_prior.id,'repeated',true,'stockRemaining',v_product.stock_quantity);
 END IF;
 INSERT INTO public.retail_stock_adjustments(
   request_id,shop_id,product_id,previous_stock,new_stock,note
 ) VALUES (
   p_request_id,p_shop_id,p_product_id,v_product.stock_quantity,p_new_stock,trim(p_note)
 ) RETURNING * INTO v_prior;
 UPDATE public.retail_products SET stock_quantity=p_new_stock WHERE id=p_product_id;
 RETURN jsonb_build_object('id',v_prior.id,'repeated',false,'stockRemaining',p_new_stock);
END; $fn$;
REVOKE ALL ON FUNCTION public.set_retail_stock(uuid,uuid,integer,text,uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_retail_stock(uuid,uuid,integer,text,uuid)
TO service_role;

-- Public listing is read through a curated server endpoint, not exposed SQL tables.
INSERT INTO public.retail_products(shop_id,slug,name,description,price,stock_quantity,active)
SELECT id,'golden-moustache-matte-60g','Pomada Matte 60g · Golden Moustache',
 'Pomada para modelar el cabello con acabado mate. Consultá disponibilidad en el local.',
 350,0,true
FROM public.shops WHERE id='11111111-1111-1111-1111-111111111113'::uuid
ON CONFLICT(shop_id,slug) DO NOTHING;
