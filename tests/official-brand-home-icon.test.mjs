import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('iPhone uses apple-touch-icon with official 13 Cut logo at 180 pixels',()=>{
  const apple=read('app/apple-icon.tsx');
  const renderer=read('lib/brand-home-icon.tsx');
  assert.match(apple,/width:180,height:180/);
  assert.match(apple,/export default async function AppleIcon/);
  assert.match(apple,/return makeBrandIcon\(size\.width\)/);
  assert.match(renderer,/zdhuymfapknpogdrbksn\.supabase\.co\/storage\/v1\/object\/public\/media\//);
  assert.match(renderer,/0f5ab934-db55-46d2-a829-ecd59150d61a\.png\?v=1791937983092/);
  assert.match(renderer,/objectFit:'contain'/);
});

test('browser and Android icon reuse exactly the same brand asset',()=>{
  const icon=read('app/icon.tsx');
  const manifest=JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.icons[0].src,'/icon');
  assert.match(icon,/width:192,height:192/);
  assert.match(icon,/makeBrandIcon\(size\.width\)/);
  assert.doesNotMatch(icon,/fontSize:76/);
});

test('does not enable automatic deployment or touch bookings and finance',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.equal(config.git.deploymentEnabled,false);
  const apple=read('app/apple-icon.tsx');
  assert.doesNotMatch(apple,/supabase-server|service_role|BOOKING|/i);
});
