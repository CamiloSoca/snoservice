import {NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import nodemailer from 'nodemailer';
import {buildFixedMonthlyExhaustionEmail} from '@/lib/booking-email';

// RUTA TEMPORAL SOLO PARA QA. Eliminar antes de mergear el PR.
// Solo en Vercel PREVIEW y con un token secreto de preview, sin BD ni caja.
export async function GET(request:Request){
  const token=process.env.MONTHLY_EMAIL_TEST_TOKEN||'';
  const recipient=process.env.MONTHLY_EMAIL_TEST_TO||'';
  const given=new URL(request.url).searchParams.get('token')||'';
  const same=token.length===given.length&&token.length>=40&&
    timingSafeEqual(Buffer.from(given),Buffer.from(token));
  if(process.env.VERCEL_ENV!=='preview'||!same||
      Date.now()>=Date.parse('2026-11-03T03:00:00Z'))
    return NextResponse.json({error:'No autorizado.'},{status:403,headers:{'Cache-Control':'no-store'}});
  if(!recipient||!process.env.SMTP_USER||!process.env.SMTP_PASS)
    return NextResponse.json({error:'Configuración de prueba incompleta.'},{status:503,headers:{'Cache-Control':'no-store'}});
  try{
    const port=Number(process.env.SMTP_PORT)||465;
    const sender=nodemailer.createTransport({
      host:process.env.SMTP_HOST||'smtp.zoho.com',port,secure:port===465,
      auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},
      connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
    });
    const email=buildFixedMonthlyExhaustionEmail({
      clientName:'Cliente de prueba',shopName:'13 CUT',
      nextDate:'2026-11-29',nextTime:'12:00',
    });
    const result=await sender.sendMail({
      from:`"13 CUT" <${process.env.SMTP_USER}>`,
      to:recipient,
      subject:'[PRUEBA · NO ES UN COBRO] '+email.subject,
      html:email.html,
      text:'ESTE ES UN CORREO DE PRUEBA. No corresponde a tu cortesía ni a una mensualidad real.\n\n'+email.text,
    });
    const accepted=(result.accepted||[]).some(e=>e.toLowerCase()===recipient.toLowerCase());
    return NextResponse.json({test:true,smtpAccepted:accepted},
      {status:accepted?200:502,headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const code=error&&typeof error==='object'&&'code' in error?String(error.code):'SMTP_ERROR';
    return NextResponse.json({test:true,smtpAccepted:false,error:code},
      {status:502,headers:{'Cache-Control':'no-store'}});
  }
}
