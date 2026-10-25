// Fechas elegibles para saltear una única ocurrencia de un cliente fijo.
// Usar fechas ISO/UTC para que el día de semana no cambie por huso horario.
export interface FixedOccurrenceRule {
  weekday:number;
  start_date:string;
  end_date:string|null;
  skipped_dates:string[];
}
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const midnight=(iso:string)=>{
  if(!ISO.test(iso))return NaN;
  const result=Date.parse(iso+'T00:00:00Z');
  return Number.isFinite(result)&&new Date(result).toISOString().slice(0,10)===iso
    ?result:NaN;
};
export function upcomingFixedDates(rule:FixedOccurrenceRule,today:string,maxCount=26):string[]{
  const start=Math.max(midnight(today),midnight(rule.start_date));
  if(!Number.isFinite(start)||!Number.isInteger(rule.weekday)||
    rule.weekday<0||rule.weekday>6||!Number.isInteger(maxCount)||maxCount<1)return [];
  const end=rule.end_date?midnight(rule.end_date):Infinity;
  if(Number.isNaN(end))return [];
  const delta=(rule.weekday-new Date(start).getUTCDay()+7)%7;
  const days:string[]=[];
  // Generar como máximo dos años; no ofrecer turnos remotos indefinidamente.
  for(let n=0;n<104&&days.length<maxCount;n++){
    const iso=new Date(start+(delta+7*n)*86400000).toISOString().slice(0,10);
    if(midnight(iso)>end)break;
    if(!rule.skipped_dates?.includes(iso))days.push(iso);
  }
  return days;
}
