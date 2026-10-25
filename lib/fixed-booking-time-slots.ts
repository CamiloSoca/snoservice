// Bloques de 30 minutos para la agenda fija.
// Se alinean a la apertura efectiva (local + barbero), igual que la agenda pública.
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
  const extra=durationMinutes<90?30:0;
  const slots:string[]=[];
  for(let start=opening;start<closing;start+=30){
    // Nunca crear bloques que atraviesen medianoche.
    if(start+durationMinutes<=closing+extra&&start+durationMinutes<=1440){
      slots.push(label(start));
    }
  }
  return slots;
}
