-- Extensión segura para fotos de barberos, sin alterar precios, horarios,
-- reservas, comisiones ni datos existentes.
ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS image_url text;

-- Lectura pública para mostrar retratos. Escribir SOLO por el servidor
-- (service_role) tras autenticar al administrador; no crear policies de upload.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('barber-photos','barber-photos',true,2097152,
        ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public=true, file_size_limit=2097152,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

-- Ambas RPC ya están desplegadas con SECURITY INVOKER y sin EXECUTE
-- para visitantes. Agregar solamente image_url a la proyección actual,
-- manteniendo todos los filtros, permisos y columnas previos.
DO $m$
DECLARE fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='public_shop_snapshot'
    AND pg_get_function_identity_arguments(p.oid)='p_shop_id uuid';
  IF fn IS NULL THEN RAISE EXCEPTION 'Falta public_shop_snapshot'; END IF;
  IF position('service_ids, active, image_url' IN fn)=0 THEN
    IF position('service_ids, active' IN fn)=0 THEN
      RAISE EXCEPTION 'Cambió la definición de public_shop_snapshot';
    END IF;
    fn := replace(fn,'service_ids, active','service_ids, active, image_url');
    EXECUTE fn;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='admin_bootstrap_snapshot'
    AND pg_get_function_identity_arguments(p.oid)='p_shop_id uuid';
  IF fn IS NULL THEN RAISE EXCEPTION 'Falta admin_bootstrap_snapshot'; END IF;
  IF position('commission_rate,is_owner,image_url' IN fn)=0 THEN
    IF position('commission_rate,is_owner' IN fn)=0 THEN
      RAISE EXCEPTION 'Cambió la definición de admin_bootstrap_snapshot';
    END IF;
    fn := replace(fn,'commission_rate,is_owner','commission_rate,is_owner,image_url');
    EXECUTE fn;
  END IF;
END $m$;
