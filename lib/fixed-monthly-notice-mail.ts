import nodemailer from 'nodemailer';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {buildFixedMonthlyExhaustionEmail} from '@/lib/booking-email';

type PendingNotice={
  notice_id:string;period_id:string;recipient_email:string;client_name:string;
  shop_name:string;next_occurrence_date:string;next_time_slot:string;
};
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Usar la misma plantilla de confirmación de reservas, no otra paleta.
export const monthlyExhaustedEmail=buildFixedMonthlyExhaustionEmail;

// El evento se origina únicamente después del 4.º uso confirmado por PostgreSQL.
// SMTP nunca modifica el corte, su pago, la comisión ni la caja.
// Un retry se procesa como máximo 3 veces desde la outbox, con claim atómico.
export async function dispatchFixedMonthlyNotice(periodId:string|null=null):Promise<'accepted'|'none'|'failed'>{
  const db=getSupabaseServer();
  const {data,error}=await db.rpc('claim_fixed_monthly_notice',{
    p_shop_id:SHOP_UUID,p_period_id:periodId,
  });
  if(error){
    // Migración todavía no instalada -> nunca bloquear un servicio realizado.
    console.warn('Monthly notice not available:',error.code);
    return 'failed';
  }
  const notice=(data as PendingNotice[]|null)?.[0];
  if(!notice)return 'none';
  let accepted=false;
  let messageId='';
  let failure='SMTP_REJECTED';
  try{
    if(!validEmail(notice.recipient_email)){failure='INVALID_EMAIL';throw new Error(failure);}
    if(!process.env.SMTP_USER||!process.env.SMTP_PASS){failure='SMTP_NOT_CONFIGURED';throw new Error(failure);}
    const transport=nodemailer.createTransport({
      host:process.env.SMTP_HOST||'smtp.zoho.com',
      port:Number(process.env.SMTP_PORT)||465,
      secure:(Number(process.env.SMTP_PORT)||465)===465,
      auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},
      connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
    });
    const content=monthlyExhaustedEmail({
      clientName:notice.client_name,shopName:notice.shop_name,
      nextDate:notice.next_occurrence_date,nextTime:notice.next_time_slot,
    });
    const result=await transport.sendMail({
      from:`"13 CUT" <${process.env.SMTP_USER}>`,
      to:notice.recipient_email,
      ...content,
    });
    accepted=(result.accepted||[]).some(email=>
      email.toLowerCase()===notice.recipient_email.toLowerCase());
    messageId=String(result.messageId||'').slice(0,200);
    if(!accepted)failure='RECIPIENT_NOT_ACCEPTED';
  }catch(e){
    if(failure==='SMTP_REJECTED'){
      const code=typeof e==='object'&&e!==null&&'code'in e?String(e.code):'ERROR';
      failure='SMTP_'+code.replace(/[^a-zA-Z0-9_]/g,'').slice(0,35);
    }
  }
  const {error:finishError}=await db.rpc('finish_fixed_monthly_notice',{
    p_shop_id:SHOP_UUID,p_notice_id:notice.notice_id,
    p_status:accepted?'accepted':'failed',
    p_message_id:accepted?messageId:null,
    p_failure:accepted?null:failure,
  });
  if(finishError)console.error('Monthly notice result not persisted:',finishError.code);
  if(!accepted)console.warn('Monthly notice SMTP failure:',failure);
  return accepted?'accepted':'failed';
}
