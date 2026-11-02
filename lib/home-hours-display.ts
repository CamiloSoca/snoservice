import type {BusinessSchedule} from '@/lib/appointment-rules';

// Solo presentación: los días y las horas provienen del horario existente.
// Nunca se modifica la disponibilidad ni el cálculo de turnos.
const DAY_KEYS=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'] as const;
const DAY_LABELS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'] as const;

export type DisplayHourGroup={
  keys:string[];
  label:string;
  isOpen:boolean;
  hours:string;
};

const compact=(time:string)=>time.replace(/:00$/,'');
const daySummary=(schedule:BusinessSchedule,day:string)=>{
  const rule=schedule[day];
  const isOpen=rule?.isOpen===true&&Boolean(rule.openTime)&&Boolean(rule.closeTime);
  const hours=isOpen?`${compact(rule.openTime!)} – ${compact(rule.closeTime!)}`:'Cerrado';
  return {isOpen,hours};
};

export function groupOpeningHours(schedule:BusinessSchedule):DisplayHourGroup[]{
  const groups:DisplayHourGroup[]=[];
  DAY_KEYS.forEach((key,index)=>{
    const current=daySummary(schedule,key);
    const previous=groups[groups.length-1];
    if(previous&&previous.isOpen===current.isOpen&&previous.hours===current.hours){
      previous.keys.push(key);
      previous.label=`${DAY_LABELS[index-previous.keys.length+1]} – ${DAY_LABELS[index]}`;
    }else{
      groups.push({keys:[key],label:DAY_LABELS[index],...current});
    }
  });
  return groups;
}

export function montevideoWeekday(date:Date):string{
  const day=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Montevideo',weekday:'long',
  }).format(date).toLowerCase();
  const weekday:Record<string,string>={
    monday:'lunes',tuesday:'martes',wednesday:'miercoles',
    thursday:'jueves',friday:'viernes',saturday:'sabado',sunday:'domingo',
  };
  return weekday[day]||'';
}
