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
  assert.match(sender,/escapeHtml/);
  assert.match(sender,/No se realiza ningún cobro automático/);
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
