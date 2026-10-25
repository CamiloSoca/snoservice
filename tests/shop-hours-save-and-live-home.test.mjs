import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

const server=read('app/api/admin/route.ts');
const page=read('app/admin/page.tsx');
const editor=read('components/WeeklyScheduleEditor.tsx');
const store=read('lib/booking-store.ts');
const home=read('components/HomeClient.tsx');
const publicRoute=read('app/api/public/shop/route.ts');
const provider=read('components/PublicShopProvider.tsx');
const browserStore=read('lib/public-shop-data.ts');
const migration=read('supabase/migrations/20261025_shop_staff_schedule_revision.sql');
const vercel=JSON.parse(read('vercel.json'));

test('local hours have an independent validated write and read-after-write response',()=>{
 assert.match(server,/case 'SAVE_SHOP_HOURS'/);
 assert.match(server,/normalizeHours\(body\.schedule\)/);
 assert.match(server,/\.update\(\{schedule\}\)\.eq\('id',SHOP_UUID\)/);
 assert.match(server,/\.select\('schedule'\)\.maybeSingle\(\)/);
 assert.match(server,/revalidateTag\('public-shop-'\+SHOP_UUID,\{expire:0\}\)/);
 assert.match(store,/operation:'SAVE_SHOP_HOURS'/);
 assert.match(store,/invalidatePublicShopData\(\)/);
});
test('UI distinguishes shop schedule saving from saving the local address and branding',()=>{
 assert.match(page,/handleSaveShopHours/);
 assert.match(page,/shopHoursDirty/);
 assert.match(page,/shopHoursSaving/);
 assert.match(page,/Cambios sin guardar/);
 assert.match(page,/Guardar horarios de la barbería/);
 assert.match(page,/Guardar datos generales/);
 assert.match(page,/type="button" onClick=\{\(\)=>\{void handleSaveShopHours\(\);\}\}/);
 assert.match(page,/Tenés horarios modificados sin guardar/);
});
test('both shop and staff use the same clear schedule controls',()=>{
 assert.match(page,/WeeklyScheduleEditor title="Horarios de la barbería"/);
 assert.match(page,/WeeklyScheduleEditor title=\{'Horarios de '\+brb\.name\}/);
 for(const label of ['Lun a vie','Solo sábados','Toda la semana','Cerrar todos','Abierto','Cerrado']){
   assert.ok(editor.includes(label),label);
 }
 assert.match(editor,/aria-pressed=\{rule.isOpen\}/);
 assert.match(editor,/style=\{\{colorScheme:'dark'\}\}/);
});
test('public hours come from the dynamic catalog and refresh frequently',()=>{
 assert.match(home,/const activeSchedule = shopConfig\.schedule/);
 assert.match(publicRoute,/'Cache-Control': 'no-store'/);
 assert.match(provider,/setInterval\(refreshIfNeeded, 10_000\)/);
 assert.match(browserStore,/REVALIDATE_AFTER_MS = 15 \* 1000/);
 assert.match(server,/case 'SAVE_BARBERS'/);
});
test('saving shop or barber weekly hours increments agenda revision without touching money',()=>{
 assert.match(migration,/BEFORE UPDATE OF schedule ON public.shops/);
 assert.match(migration,/NEW\.agenda_revision:=COALESCE\(OLD\.agenda_revision,0\)\+1/);
 assert.match(migration,/AFTER UPDATE OF working_schedule ON public.barbers/);
 assert.match(migration,/IF NEW\.working_schedule IS DISTINCT FROM OLD\.working_schedule/);
 assert.equal(vercel.git.deploymentEnabled,false);
});
