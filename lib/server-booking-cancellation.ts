import 'server-only';
import nodemailer from 'nodemailer';
import {buildBookingCancellationEmail, type BookingCancellationEmail} from '@/lib/booking-email';
import {getSupabaseServer, SHOP_UUID} from '@/lib/supabase-server';

export type CancellationEmailStatus = 'accepted' | 'rejected' | 'failed' | 'unconfigured' | 'missing_recipient';

type CancellationNoticeInput = BookingCancellationEmail & {
  appointmentId: string;
  clientEmail: string | null | undefined;
};

async function auditCancellationEmail(appointmentId: string, result: CancellationEmailStatus) {
  try {
    const {error} = await getSupabaseServer().from('audit_logs').insert({
      shop_id: SHOP_UUID,
      action: 'CANCELLATION_EMAIL_' + result.toUpperCase(),
      details: appointmentId,
    });
    if (error) console.warn('No se pudo guardar auditoría de correo cancelado:', error.code);
  } catch {
    console.warn('No se pudo guardar auditoría de correo cancelado.');
  }
}

/** Se invoca únicamente DESPUÉS de persistir confirmado -> cancelado.
 *  El aviso nunca revierte la cancelación; el resultado se informa al panel.
 *  El SMTP acepta/rehúsa el mensaje, pero no garantiza entrega en bandeja.
 */
export async function sendBookingCancellationNotice(input: CancellationNoticeInput):
  Promise<CancellationEmailStatus> {
  const address = String(input.clientEmail || '').trim().toLowerCase();
  let status: CancellationEmailStatus;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    status = 'missing_recipient';
  } else if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    status = 'unconfigured';
  } else {
    try {
      const port = Number(process.env.SMTP_PORT) || 465;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.zoho.com',
        port,
        secure: port === 465,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 9000,
        auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASS},
      });
      const message = buildBookingCancellationEmail(input);
      const receipt = await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: address,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      status = receipt.accepted?.some(
        (candidate: string) => candidate.toLowerCase() === address
      ) ? 'accepted' : 'rejected';
    } catch (error) {
      const category = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code).slice(0, 30) : 'UNKNOWN';
      console.error('No se pudo enviar el aviso de cancelación:', category);
      status = 'failed';
    }
  }
  await auditCancellationEmail(input.appointmentId, status);
  return status;
}
