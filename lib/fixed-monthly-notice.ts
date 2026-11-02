// Regla pura: las mensualidades cubren cuatro cortes por mes calendario.
// La próxima visita fija de ese mismo mes se cobra por separado.
export interface MonthlyFixedSchedule {
  weekday:number;
  start_date:string;
  end_date:string|null;
  skipped_dates:string[];
  active?:boolean;
}
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const dayNumber=(value:string)=>{
  if(!ISO.test(value))return NaN;
  const n=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:NaN;
};

export function nextExtraMonthlyVisit(
  rule:MonthlyFixedSchedule,
  lastCoveredDate:string,
  today:string=lastCoveredDate,
):string|null {
  const last=dayNumber(lastCoveredDate);
  const current=dayNumber(today);
  if(rule.active===false||!Number.isFinite(last)||!Number.isFinite(current)||
     !Number.isInteger(rule.weekday)||rule.weekday<0||rule.weekday>6)return null;
  const start=dayNumber(rule.start_date);
  const end=rule.end_date?dayNumber(rule.end_date):Infinity;
  if(!Number.isFinite(start)||Number.isNaN(end))return null;
  const month=lastCoveredDate.slice(0,7);
  for(let day=last+86400000;new Date(day).toISOString().slice(0,7)===month;day+=86400000){
    const value=new Date(day).toISOString().slice(0,10);
    if(day>=start&&day<=end&&day>=current&&new Date(day).getUTCDay()===rule.weekday&&
       !(rule.skipped_dates||[]).includes(value))return value;
  }
  return null;
}

// El mismo predicado sirve para destacar el turno en ambas agendas.
export function monthlyExtraPaymentDue(input:{
  isFixed?:boolean;isCourtesy?:boolean;completed?:boolean;
  monthlyActive?:boolean;periodPaid?:boolean;used?:number;included?:number;
}):boolean{
  return input.isFixed===true&&input.isCourtesy!==true&&input.completed!==true&&
    input.monthlyActive===true&&input.periodPaid===true&&
    Number.isFinite(input.used)&&Number.isFinite(input.included)&&
    (input.used??0)>=(input.included??4);
}
