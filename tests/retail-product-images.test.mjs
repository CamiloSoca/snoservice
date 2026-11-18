import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261118_retail_product_images.sql');
const api=read('app/api/retail/route.ts');
const uploader=read('app/api/retail/image/route.ts');
const resolver=read('lib/retail-images.ts');
const publicPage=read('app/ceras/page.tsx');
const admin=read('components/RetailSalesPanel.tsx');

test('la pomada original conserva su imagen individual en la base',()=>{
 assert.match(migration,/ADD COLUMN IF NOT EXISTS image_path/);
 assert.match(migration,/golden-moustache-pomada-matte-60g\.jpg/);
 assert.match(migration,/golden-moustache-matte-60g/);
 assert.match(migration,/AND image_path=''/);
});
test('catalogo y panel usan imagen dinamica del producto',()=>{
 assert.match(api,/imageUrl:imageUrl\(p\.image_path\)/);
 assert.match(publicPage,/product\.imageUrl/);
 assert.match(publicPage,/<RetailProductPhoto src=\{product\.imageUrl\}/);
 assert.match(admin,/product\.imageUrl/);
 assert.match(admin,/<Image src=\{product\.imageUrl\}/);
 assert.match(resolver,/getPublicUrl\(objectPath\)/);
});
test('admin puede agregar productos y subir fotos sin abrir permisos publicos',()=>{
 assert.match(api,/body\.action==='SAVE_PRODUCT'&&identity\.role==='admin'/);
 assert.match(uploader,/requireAdminSession\(\)/);
 assert.match(uploader,/verifyCsrfOrigin\(request\)/);
 assert.match(uploader,/maxBytes=2\*1024\*1024/);
 assert.match(uploader,/image\/webp/);
 assert.match(uploader,/image\/jpeg/);
 assert.match(uploader,/image\/png/);
 assert.match(uploader,/upsert:false/);
 assert.match(admin,/Agregar producto/);
 assert.match(admin,/imagePath:draft\.imagePath/);
});
test('nuevos productos empiezan sin stock y los precios se pueden configurar',()=>{
 assert.match(api,/stock_quantity:0/);
 assert.match(api,/price,active,image_path:imagePath/);
 assert.match(admin,/Crear producto \(stock 0\)/);
 assert.match(admin,/type="number" min="0\.01"/);
});
test('las imagenes almacenadas son rutas aprobadas, no enlaces arbitrarios',()=>{
 assert.match(resolver,/validRetailImagePath/);
 assert.match(resolver,/path\.includes\('\.\.'\)/);
 assert.match(resolver,/storage:/);
 assert.match(migration,/retail-product-images/);
 assert.match(migration,/allowed_mime_types/);
});
