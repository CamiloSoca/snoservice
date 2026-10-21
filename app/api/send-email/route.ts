import { requireAdminSession, verifyCsrfOrigin } from '@/lib/session';
// app/api/send-email/route.ts
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true, // true para puerto 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) return NextResponse.json({error: 'Origen inválido'}, {status: 403});
  if (!await requireAdminSession()) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  try {
    const { clientEmail, clientName, serviceName, barberName, dateString, timeSlot, code, shopName, shopAddress } = await request.json();

    if (!clientEmail) {
      return NextResponse.json({ error: 'Falta el correo del cliente' }, { status: 400 });
    }

    await transporter.sendMail({
      from: `"13-Cut" <${process.env.SMTP_USER}>`,
      to: clientEmail,
      subject: `¡Turno Confirmado! - ${shopName}`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 24px; border-radius: 12px;">
          <h2 style="color: #10b981; margin-top: 0;">¡Hola ${clientName}! 👋</h2>
          <p>Tu turno en <strong>${shopName}</strong> ha sido confirmado con éxito.</p>
          
          <div style="background-color: #18181b; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #27272a;">
            <p style="margin: 6px 0;">✂️ <strong>Servicio:</strong> ${serviceName}</p>
            <p style="margin: 6px 0;">💈 <strong>Barbero:</strong> ${barberName || 'Profesional asignado'}</p>
            <p style="margin: 6px 0;">📅 <strong>Fecha:</strong> ${dateString}</p>
            <p style="margin: 6px 0;">⏰ <strong>Hora:</strong> ${timeSlot} hs</p>
            <p style="margin: 6px 0;">📍 <strong>Dirección:</strong> ${shopAddress}</p>
            <p style="margin: 6px 0; color: #10b981;">🔑 <strong>Código de reserva:</strong> ${code}</p>
          </div>

          <p style="font-size: 12px; color: #a1a1aa;">Te pedimos puntualidad. ¡Te esperamos!</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}