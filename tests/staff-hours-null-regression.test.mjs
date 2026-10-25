import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (file) => readFileSync(new URL('../'+file, import.meta.url),'utf8');

test('un horario sin personalizar se guarda como SQL NULL y no JSON null',()=>{
 const migration=read('supabase/migrations/20261025_fix_barber_schedule_json_null.sql');
 assert.match(migration,/NULLIF\(v_entry->''working_schedule'',''null''::jsonb\)/);
 assert.match(migration,/UPDATE public\.barbers SET working_schedule=NULL/);
 assert.match(migration,/IF fn IS NULL OR strpos\(fn, old_update\)=0 OR strpos\(fn, old_insert\)=0/);
});

test('PWA usa un icono generado y deja de pedir icon.png inexistente',()=>{
 const manifest=JSON.parse(read('public/manifest.json'));
 const icon=read('app/icon.tsx');
 assert.equal(manifest.icons[0].src,'/icon');
 assert.equal(manifest.icons[0].type,'image/png');
 assert.match(icon,/export const size=\{width:192,height:192\}/);
 assert.match(icon,/ImageResponse/);
});
