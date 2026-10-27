import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('iPhone icon uses the active shop logo and has no hardcoded barberia asset',()=>{
  const apple=read('app/apple-icon.tsx');
  const icon=read('app/icon.tsx');
  const renderer=read('lib/brand-home-icon.tsx');
  assert.match(apple,/width:180,height:180/);
  assert.match(apple,/export default async function AppleIcon/);
  assert.match(apple,/await connection\(\)/);
  assert.match(apple,/getServerPublicShopData\(\)/);
  assert.match(icon,/getServerPublicShopData\(\)/);
  assert.match(renderer,/makeBrandIcon\(size:number,logoSource\?:string\|null\)/);
  assert.match(renderer,/storage\/v1\/object\/public/);
  assert.match(renderer,/>SN<\/div>/);
  assert.match(renderer,/new ImageResponse/);
  assert.doesNotMatch(renderer,/https?:\/\//i);
});

test('el icono usa el logo configurado del proyecto activo y reserva SN para valores ausentes o ajenos',async()=>{
  const source=read('lib/brand-home-icon.tsx');
  const compiled=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React});
  const responseModule={exports:{}};
  const calls=[];
  class FakeImageResponse { constructor(element,options){this.element=element;this.options=options;calls.push(this)} }
  runInNewContext(compiled,{
    module:responseModule,exports:responseModule.exports,React,
    process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://qa-project.supabase.co'}},URL,
    require:(name)=>{if(name==='next/og')return {ImageResponse:FakeImageResponse};throw new Error(`Unexpected import ${name}`)},
  });
  const own='https://qa-project.supabase.co/storage/v1/object/public/media/qa-logo.png';
  const ownIcon=await responseModule.exports.makeBrandIcon(180,own);
  const ownImage=ownIcon.element.props.children;
  assert.equal(ownImage.type,'img');
  assert.equal(ownImage.props.src,own);
  const foreignIcon=await responseModule.exports.makeBrandIcon(180,'https://unrelated.invalid/logo.png');
  assert.equal(foreignIcon.element.props.children.props.children,'SN');
  assert.equal(calls.length,2);
});

test('browser and Android icon reuse exactly the same brand asset',()=>{
  const icon=read('app/icon.tsx');
  const manifest=JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.icons[0].src,'/icon');
  assert.match(icon,/width:192,height:192/);
  assert.match(icon,/await connection\(\)/);
  assert.match(icon,/shopConfig\.logoUrl/);
  assert.doesNotMatch(icon,/fontSize:76/);
});

test('does not enable automatic deployment or touch bookings and finance',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.equal(config.git.deploymentEnabled,false);
  const apple=read('app/apple-icon.tsx');
  assert.doesNotMatch(apple,/supabase-server|service_role|BOOKING/i);
});
