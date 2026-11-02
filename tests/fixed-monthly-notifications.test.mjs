import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextExtraMonthlyVisit,monthlyExtraPaymentDue} from '../lib/fixed-monthly-notice.ts';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('security/production/23_fixed_monthly_exhaustion_notice_PENDING_DO_NOT_RUN.sql');
const completion=read('app/api/agenda/fixed/complete/route.ts');
const agendaApi=read('app/api/agenda/fixed/route.ts');
const agenda=read('components/AgendaCalendar.tsx');
const modal=read('components/AppointmentDetailModal.tsx');
const sender=read('lib/fixed-monthly-notice-mail.ts');
const bookingTemplate=read('lib/booking-email.ts');
const cron=read('app/api/internal/monthly-notices/route.ts');
const vercel=JSON.parse(read('vercel.json'));

const saturday={weekday:6,start_date:'2026-10-01',end_date:null,skipped_dates:[],active:true};
const sunday={weekday:0,start_date:'2026-11-01',end_date:null,skipped_dates:[],active:true};

test('octubre 2026: cuarto sábado cubierto, quinto sábado 31/10 se cobra',()=>{
  assert.equal(nextExtraMonthlyVisit(saturday,'2026-10-24','2026-10-24'),'2026-10-31');
  assert.equal(nextExtraMonthlyVisit(saturday,'2026-10-31','2026-10-31'),null);
});
test('noviembre 2026: quinto domingo sí genera recordatorio',()=>{
  assert.equal(nextExtraMonthlyVisit(sunday,'2026-11-22','2026-11-22'),'2026-11-29');
});
test('no mandar aviso cuando no existe una quinta visita real',()=>{
  assert.equal(nextExtraMonthlyVisit({...saturday,skipped_dates:['2026-10-31']},'2026-10-24'),null);
  assert.equal(nextExtraMonthlyVisit({...saturday,end_date:'2026-10-24'},'2026-10-24'),null);
  assert.equal(nextExtraMonthlyVisit({...saturday,active:false},'2026-10-24'),null);
  assert.equal(nextExtraMonthlyVisit(saturday,'2026-10-24','2026-11-01'),null);
  assert.equal(nextExtraMonthlyVisit(saturday,'2026-10-32'),null);
});
test('solo pendiente de pago después de agotar cuatro usos, nunca cortesía ni ya cobrado',()=>{
  const input={isFixed:true,isCourtesy:false,completed:false,monthlyActive:true,periodPaid:true,used:4,included:4};
  assert.equal(monthlyExtraPaymentDue(input),true);
  assert.equal(monthlyExtraPaymentDue({...input,used:3}),false);
  assert.equal(monthlyExtraPaymentDue({...input,completed:true}),false);
  assert.equal(monthlyExtraPaymentDue({...input,isCourtesy:true}),false);
  assert.equal(monthlyExtraPaymentDue({...input,periodPaid:false}),false);
  // El pago histórico del mes sigue cubriendo 4 usos aunque se pause el plan.
  assert.equal(monthlyExtraPaymentDue({...input,monthlyActive:false}),true);
  assert.equal(monthlyExtraPaymentDue({...input,isFixed:false}),false);
});
test('la base crea aviso único tras el cuarto uso sin mover reservas, caja ni cobros',()=>{
  assert.match(sql,/AFTER INSERT ON public\.fixed_monthly_uses/);
  assert.match(sql,/v_used<>v_period\.included_cuts/);
  assert.match(sql,/period_id uuid NOT NULL UNIQUE/);
  assert.match(sql,/ON CONFLICT \(period_id\) DO NOTHING/);
  assert.match(sql,/next_occurrence_date>fourth_occurrence_date/);
  assert.match(sql,/dates\.day::date <> ALL\(v_fixed\.skipped_dates\)/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/FOR UPDATE SKIP LOCKED/);
  assert.match(sql,/attempts<3/);
  assert.match(sql,/status='sending'/);
  assert.doesNotMatch(sql,/\bUPDATE public\.(cash_registers|manual_charges|fixed_monthly_uses|appointments)\b/i);
  assert.doesNotMatch(sql,/\bDELETE FROM public\.(cash_registers|manual_charges|fixed_monthly_uses|appointments)\b/i);
});
test('completar un corte es independiente del SMTP; mensaje no sale antes del éxito',()=>{
  assert.match(completion,/if\(!isValidUUID\(String\(data\|\|''\)\)\)/);
  assert.match(completion,/if\(mode==='subscription'\)\{/);
  assert.match(completion,/after\(async\(\)=>\{/);
  assert.match(completion,/dispatchFixedMonthlyNotice/);
  assert.match(sender,/result\.accepted/);
  assert.match(sender,/finish_fixed_monthly_notice/);
  assert.match(sender,/connectionTimeout:10000/);
  assert.match(sender,/buildFixedMonthlyExhaustionEmail/);
  assert.match(bookingTemplate,/No realizaremos ningún cobro automático/);
});
test('barbero ve advertencia en la agenda y al abrir el turno sin tocar el cobro',()=>{
  assert.match(agendaApi,/noticeStatus/);
  assert.match(agenda,/monthlyExtraPaymentDue/);
  assert.match(agenda,/Abono agotado · cobrar corte/);
  assert.match(agenda,/⚠ Cobrar aparte/);
  assert.match(modal,/Mensualidad agotada · cobrar corte individual/);
  assert.match(modal,/Correo al cliente:/);
  assert.match(modal,/Elegí efectivo o transferencia/);
});
test('retry solo via cron protegido y nunca expone datos privados',()=>{
  assert.match(cron,/process\.env\.CRON_SECRET/);
  assert.match(cron,/request\.headers\.get\('authorization'\)/);
  assert.match(vercel.crons[0].schedule,/^0 13 \* \* \*$/);
  assert.equal(vercel.crons[0].path,'/api/internal/monthly-notices');
});

test('email de mensualidad usa la misma plantilla que reservas, sin corazón ni enlaces falsos', async()=>{
  const {buildBookingConfirmationEmail,buildFixedMonthlyExhaustionEmail}=
    await import('../lib/booking-email.ts');
  const base=buildBookingConfirmationEmail({
    clientName:'Cliente',barberName:'Barbero',serviceName:'Corte',
    dateString:'Sáb 31 Oct',timeSlot:'12:00',durationMinutes:60,
    price:400,code:'PRUEBA-123',shopName:'13 CUT',
  });
  const email=buildFixedMonthlyExhaustionEmail({
    clientName:'Cliente de prueba',shopName:'13 CUT',
    nextDate:'2026-10-31',nextTime:'12:00',
  });
  for(const color of ['#122019','#19a96b','#eaf8f0','#18251e','#f2f5f2']){
    assert.ok(base.html.includes(color),'La confirmación debería usar '+color);
    assert.ok(email.html.includes(color),'La mensualidad debería conservar '+color);
  }
  assert.match(email.subject,/4 de 4 cortes/);
  assert.match(email.html,/BARBERÍA · AVISO DE MENSUALIDAD/);
  assert.match(email.html,/4 DE 4 CORTES UTILIZADOS/);
  assert.match(email.html,/PRÓXIMO TURNO FIJO/);
  assert.match(email.html,/31 de octubre de 2026/);
  assert.match(email.text,/No realizaremos ningún cobro automático/);
  assert.doesNotMatch(email.html,/💚|CÓDIGO DE RESERVA|Gestionar mi turno/);
  assert.doesNotMatch(email.text,/💚/);
  // La plantilla original sigue mostrando su enlace y código en las reservas.
  assert.match(base.html,/CÓDIGO DE RESERVA/);
  assert.match(base.html,/Gestionar mi turno/);
});
test('solo la fila de pago individual se destaca en rojo suave; reservas normales se conservan',async()=>{
  const {buildBookingConfirmationEmail,buildFixedMonthlyExhaustionEmail}=
    await import('../lib/booking-email.ts');
  const subscription=buildFixedMonthlyExhaustionEmail({
    clientName:'Cliente de prueba',shopName:'13 CUT',
    nextDate:'2026-11-29',nextTime:'12:00',
  });
  const booking=buildBookingConfirmationEmail({
    clientName:'Cliente de prueba',shopName:'13 CUT',
    barberName:'Nahuel',serviceName:'Corte',dateString:'Dom 29 Nov',
    timeSlot:'12:00',durationMinutes:60,price:400,code:'13C-TEST',
  });
  assert.match(subscription.html,/background-color:#fff1f0;/);
  assert.match(subscription.html,/color:#9f2929;/);
  assert.match(subscription.html,/FORMA DE PAGO/);
  assert.match(subscription.html,/Este corte se abona individualmente en la barbería/);
  assert.doesNotMatch(booking.html,/#fff1f0|#9f2929/);
  assert.match(booking.html,/Gestionar mi turno/);
  assert.match(booking.html,/CÓDIGO DE RESERVA/);
});

test('el aviso personalizado escapa nombres con HTML y no inserta scripts',async()=>{
  const {buildFixedMonthlyExhaustionEmail}=await import('../lib/booking-email.ts');
  const email=buildFixedMonthlyExhaustionEmail({
    clientName:'<script>alert(1)</script>',shopName:'13 CUT',
    nextDate:'2026-10-31',nextTime:'12:00',
  });
  assert.doesNotMatch(email.html,/<script>/);
  assert.match(email.html,/&lt;script&gt;/);
});
