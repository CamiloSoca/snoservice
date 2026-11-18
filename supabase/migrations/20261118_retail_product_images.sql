-- Per-product image paths and admin-managed image uploads for retail products.
-- Files stored under /products/* are versioned static assets; storage:... indicates
-- an object uploaded to the public product-images bucket by the admin-only API.
ALTER TABLE public.retail_products
 ADD COLUMN IF NOT EXISTS image_path text NOT NULL DEFAULT '';
ALTER TABLE public.retail_products
 DROP CONSTRAINT IF EXISTS retail_product_image_path_check;
ALTER TABLE public.retail_products
 ADD CONSTRAINT retail_product_image_path_check CHECK(
   char_length(image_path)<=260 AND (
     image_path='' OR
     image_path ~ '^/products/[a-z0-9][a-z0-9._/-]*\.(jpg|jpeg|png|webp)$' OR
     image_path ~ '^storage:[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
   )
 );
UPDATE public.retail_products
 SET image_path='/products/golden-moustache-pomada-matte-60g.jpg'
 WHERE shop_id='11111111-1111-1111-1111-111111111113'
   AND slug='golden-moustache-matte-60g'
   AND image_path='';
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('retail-product-images','retail-product-images',true,2097152,
 ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public=true,
  file_size_limit=2097152,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
