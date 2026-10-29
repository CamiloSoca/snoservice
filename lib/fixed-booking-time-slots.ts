// Nuevos turnos fijos: horas en punto, como la agenda pública.
// El primer bloque es la próxima hora completa tras la apertura efectiva.
// Solo calcula opciones: los conflictos definitivos se comprueban al guardar en PostgreSQL.
type Rule = {isOpen?:boolean;openTime?:string;closeTime?:string};
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes=(time:string)=>TIME.test(time)
  ? Number(time.slice(0,2))*60+Number(time.slice(3)):null;
const label=(total:number)=>String(Math.floor(total/60)).padStart(2,'0')
  +':'+String(total%60).padStart(2,'0');

export function fixedBookingStartSlots(rule:Rule|null|undefined,durationMinutes:number):string[]{
  if(!rule?.isOpen||!rule.openTime||!rule.closeTime||
    !Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>720)return [];
  const opening=toMinutes(rule.openTime),closing=toMinutes(rule.closeTime);
  if(opening===null||closing===null||closing<=opening)return [];
  const slots:string[]=[];
  for(let start=Math.ceil(opening/60)*60;start<closing;start+=60){
    // Nunca crear bloques que lleguen a medianoche ni la atraviesen.
    if(start+durationMinutes<=closing&&start+durationMinutes<1440){
      slots.push(label(start));
    }
  }
  return slots;
}
