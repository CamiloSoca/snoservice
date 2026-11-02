import nodemailer from 'nodemailer';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';

type PendingNotice={
  notice_id:string;period_id:string;recipient_email:string;client_name:string;
  shop_name:string;next_occurrence_date:string;next_time_slot:string;
};
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[ch]||ch));
const label=(iso:string)=>new Intl.DateTimeFormat('es-UY',{
  day:'numeric',month:'long',year:'numeric',timeZone:'UTC',
}).format(new Date(iso+'T12:00:00Z'));
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function monthlyExhaustedEmail(input:{
  clientName:string;shopName:string;nextDate:string;nextTime:string;
}){
  const shop=escapeHtml(input.shopName);
  const name=escapeHtml(input.clientName);
  const date=escapeHtml(label(input.nextDate));
  const time=escapeHtml(input.nextTime);
  return {
    subject:'13 CUT · Tus 4 cortes mensuales ya fueron utilizados',
    text:`Hola ${input.clientName}. Ya utilizaste los cuatro cortes incluidos en tu mensualidad. Tu próximo turno fijo del ${label(input.nextDate)} a las ${input.nextTime} sigue reservado, pero se cobra como corte individual en la barbería. La mensualidad no se renueva automáticamente ni se cobrará nada por este correo. Gracias por elegir ${input.shopName}.`,
    html:`<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f7f5;font-family:Arial,sans-serif;color:#18251e;">
<div style="max-width:540px;margin:auto;background:white;border:1px solid #dce5de;border-radius:16px;overflow:hidden;">
<div style="background:#121212;color:#f5f7f5;padding:22px 24px;"><strong style="font-size:20px;">${shop}</strong><div style="color:#1ecb62;margin-top:6px;font-size:13px;">Aviso de mensualidad</div></div>
<div style="padding:24px;"><h2 style="font-size:22px;">¡Hola, ${name}!</h2>
<p style="line-height:1.6;">Ya utilizaste los <strong>4 cortes incluidos</strong> en tu mensualidad.</p>
<p style="line-height:1.6;">Tu próximo turno fijo sigue reservado:</p>
<div style="border-radius:10px;background:#eff8f1;padding:16px;border:1px solid #ccebd5;"><strong>${date} · ${time} hs</strong></div>
<p style="line-height:1.6;">Ese corte <strong>no está incluido en el abono de este mes</strong> y se abona individualmente en la barbería.</p>
<p style="line-height:1.6;">No se realiza ningún cobro automático. Gracias por elegirnos.</p>
<p style="font-size:12px;color:#64716a;">Este es un aviso informativo de tu agenda fija de ${shop}.</p></div></div></body></html>`,
  };
}

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
