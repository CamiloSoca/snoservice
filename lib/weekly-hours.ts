import type {BusinessSchedule} from './appointment-rules';

export const WEEK_DAYS = [
  {key:'lunes',label:'Lunes'},
  {key:'martes',label:'Martes'},
  {key:'miercoles',label:'Miércoles'},
  {key:'jueves',label:'Jueves'},
  {key:'viernes',label:'Viernes'},
  {key:'sabado',label:'Sábado'},
  {key:'domingo',label:'Domingo'},
] as const;
export type WeeklyHours = Record<string,{isOpen:boolean;openTime:string;closeTime:string}>;
const VALID_TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const minute=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));

export function normalizeHours(value:unknown):WeeklyHours|null {
  if(value===null||value===undefined) return null; // Hereda el horario del local
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Horario semanal inválido.');
  const rows=value as Record<string,unknown>;
  if(Object.keys(rows).some(k=>!WEEK_DAYS.some(d=>d.key===k)))throw new Error('Día de la semana inválido.');
  const result:WeeklyHours={};
  for(const day of WEEK_DAYS) {
    const raw=rows[day.key];
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Falta configurar '+day.label+'.');
    const rule=raw as Record<string,unknown>;
    if(typeof rule.isOpen!=='boolean'||typeof rule.openTime!=='string'||typeof rule.closeTime!=='string'||
       !VALID_TIME.test(rule.openTime)||!VALID_TIME.test(rule.closeTime)||minute(rule.openTime)>=minute(rule.closeTime)) {
      throw new Error('Revisá la apertura y cierre de '+day.label+'.');
    }
    result[day.key]={isOpen:rule.isOpen,openTime:rule.openTime,closeTime:rule.closeTime};
  }
  return result;
}
export function resolvedHours(shop:BusinessSchedule,barber:WeeklyHours|null|undefined):WeeklyHours{
  const result:WeeklyHours={};
  for(const d of WEEK_DAYS){
    const base=shop[d.key];
    const own=barber?.[d.key];
    const open=base?.isOpen===true&&(!barber||own?.isOpen===true);
    const maxStart=(a:string,b:string)=>minute(a)>minute(b)?a:b;
    const minEnd=(a:string,b:string)=>minute(a)<minute(b)?a:b;
    const openTime=base?.openTime||'09:00',closeTime=base?.closeTime||'19:00';
    result[d.key]={isOpen:open,openTime:own?maxStart(openTime,own.openTime):openTime,
      closeTime:own?minEnd(closeTime,own.closeTime):closeTime};
    if(minute(result[d.key].openTime)>=minute(result[d.key].closeTime))result[d.key].isOpen=false;
  }
  return result;
}
