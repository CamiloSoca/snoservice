// Lee credenciales locales sólo en memoria; jamás imprime PIN, claves ni cookies.
// No escribe datos. Requiere localhost apuntando a Supabase staging.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

const base = process.env.LOCAL_BASE_URL || 'http://localhost:3015';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
  .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map(line => {
    const i = line.indexOf('=');
    return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];
  }));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,
  'https://vjtwvhdiypfxgodhnjiw.supabase.co','sólo staging');

const login = await fetch(base+'/api/auth',{method:'POST',
  headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({username:env.ADMIN_USER,
    password:env.ADMIN_PASS || env.ADMIN_PASSWORD})});
assert.equal(login.status,200,'login administrador');
const adminCookie=(login.headers.get('set-cookie') || '').split(';')[0];
assert.ok(adminCookie.startsWith('barber_admin_session='));
const adminResponse=await fetch(base+'/api/admin/bootstrap',{headers:{cookie:adminCookie}});
assert.equal(adminResponse.status,200,'bootstrap administrador');
const admin=await adminResponse.json();
assert.ok(Array.isArray(admin.barbers) && admin.barbers.length>0);
assert.ok(admin.barbers.every(item => !Object.hasOwn(item,'pin')),
  'el PIN no sale al navegador');
const barberList=await fetch(base+'/api/admin?resource=barbers',{headers:{cookie:adminCookie}});
assert.equal(barberList.status,200);
assert.ok((await barberList.json()).data.every(item => !Object.hasOwn(item,'pin')));
console.log('admin: acceso correcto, GET y bootstrap sin PIN');

const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{persistSession:false,autoRefreshToken:false}});
const {data:barbers,error}=await db.from('barbers').select('id,pin,active')
  .eq('shop_id',env.NEXT_PUBLIC_SHOP_ID || env.SHOP_ID).eq('active',true).limit(2);
assert.ifError(error);
const own=barbers.find(item => /^\d{4,6}$/.test(item.pin || '') && item.pin!=='1234');
assert.ok(own,'PIN de prueba activo');
const barberLogin=await fetch(base+'/api/barber',{method:'POST',
  headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({barberId:own.id,pin:own.pin})});
assert.equal(barberLogin.status,200,'login barbero con PIN');
const barberCookie=(barberLogin.headers.get('set-cookie') || '').split(';')[0];
assert.ok(barberCookie.startsWith('barber_staff_session='));
const barberResponse=await fetch(base+'/api/barber/bootstrap',{headers:{cookie:barberCookie}});
assert.equal(barberResponse.status,200,'bootstrap barbero');
const barber=await barberResponse.json();
assert.ok(!Object.hasOwn(barber,'pin'));
assert.ok(barber.appointments.every(item => item.barberId===own.id));
assert.ok(barber.tips.every(item => item.barberId===own.id));
assert.ok(barber.manualCharges.every(item => item.barberId===own.id));
const other=barbers.find(item => item.id!==own.id);
if (other) {
  const denied=await fetch(base+'/api/finance?resource=tips&barberId='+other.id,
    {headers:{cookie:barberCookie}});
  assert.equal(denied.status,401,'otro barbero no puede consultar propinas');
}
console.log('barbero: PIN válido, aislamiento de perfil y finanzas');
