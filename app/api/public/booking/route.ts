import nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';
// app/api/public/booking/route.ts
import { NextResponse, after } from 'next/server';
import { getSupabaseServer, SHOP_UUID, SHOP_PREFIX } from '@/lib/supabase-server';
import {
  isSlotAvailable,
  isValidUUID,
  isValidUruguayanPhone,
  sanitizeInput,
  AppointmentItem,
  ServiceItem,
} from '@/lib/booking-store';

// Los turnos se guardan como "Mié 21 Oct" (sin año), el mismo formato
// generado por buildRealOpenDays. La agenda publica muestra los siguientes
// 30 dias calendario: no tiene sentido consultar todo el historial.
function getVisibleBookingDates(): string[] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);
  const utcDay = Date.UTC(part('year'), part('month') - 1, part('day'));
  const weekNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const dates: string[] = ['Hoy'];
  // Margen de 2 dias por diferencias de huso horario, 45 hacia adelante.
  for (let offset = -2; offset < 46; offset += 1) {
    const d = new Date(utcDay + offset * 86_400_000);
    dates.push(`${weekNames[d.getUTCDay()]} ${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`);
  }
  return dates;
}

export async function GET() {
  try {
    const supabase = getSupabaseServer();

    const { data, error } = await supabase
      .from('appointments')
      .select('barber_id,date_string,time_slot,duration_minutes,status')
      .eq('shop_id', SHOP_UUID)
      .neq('status', 'cancelado')
      .in('date_string', getVisibleBookingDates());

    if (error) {
      console.error('Error detallado de Supabase en GET /booking:', error);
      return NextResponse.json(
        { error: `Error de base de datos: ${error.message}` },
        { status: 500 }
      );
    }

    // El navegador solo necesita intervalos ocupados, no una estructura
    // completa de turno con campos vacíos ni datos de clientes.
    const sanitizedSlots = (data || []).map((apt) => ({
      barberId: apt.barber_id,
      dateString: apt.date_string,
      timeSlot: apt.time_slot,
      durationMinutes: Number(apt.duration_minutes) || 60,
      status: apt.status || 'confirmado',
    }));

    return NextResponse.json({ appointments: sanitizedSlots }, {
      headers: {'Cache-Control': 'private, no-store'},
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error de configuración en el servidor.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serviceId, barberId, dateString, timeSlot, clientName, clientPhone, clientEmail, clientNotes } = body;

    if (!isValidUUID(serviceId) || !isValidUUID(barberId)) {
      return NextResponse.json({ error: 'Servicio o barbero inválido.' }, { status: 400 });
    }

    const cleanName = sanitizeInput(String(clientName || '')).slice(0, 80);
    const cleanPhone = sanitizeInput(String(clientPhone || '')).slice(0, 25);
    const cleanEmail = sanitizeInput(String(clientEmail || '')).slice(0, 100).toLowerCase();
    const cleanNotes = sanitizeInput(String(clientNotes || '')).slice(0, 300);
    const cleanDate = sanitizeInput(String(dateString || '')).slice(0, 30);
    const cleanTime = sanitizeInput(String(timeSlot || '')).slice(0, 10);

    if (cleanName.length < 3 || !cleanEmail.includes('@')) {
      return NextResponse.json(
        { error: 'Ingresá tu nombre y un correo electrónico válido.' },
        { status: 400 }
      );
    }

    if (!/^\d{2}:\d{2}$/.test(cleanTime) || !cleanDate) {
      return NextResponse.json({ error: 'Fecha u horario inválido.' }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    const [{ data: serviceRow, error: srvErr }, { data: barberRow, error: brbErr }] =
      await Promise.all([
        supabase
          .from('services')
          .select('id, name, price, duration_minutes, active')
          .eq('id', serviceId)
          .eq('shop_id', SHOP_UUID)
          .maybeSingle(),
        supabase
          .from('barbers')
          .select('id, name, service_ids, active')
          .eq('id', barberId)
          .eq('shop_id', SHOP_UUID)
          .maybeSingle(),
      ]);

    if (srvErr || !serviceRow || !serviceRow.active) {
      return NextResponse.json(
        { error: 'El servicio seleccionado no está disponible.' },
        { status: 400 }
      );
    }

    if (brbErr || !barberRow || !barberRow.active) {
      return NextResponse.json(
        { error: 'El barbero seleccionado no está disponible.' },
        { status: 400 }
      );
    }

    const barberServiceIds: string[] = Array.isArray(barberRow.service_ids)
      ? barberRow.service_ids
      : [];
    if (barberServiceIds.length > 0 && !barberServiceIds.includes(serviceRow.id)) {
      return NextResponse.json(
        { error: 'Este barbero no realiza el servicio seleccionado.' },
        { status: 400 }
      );
    }

    const realPrice = Number(serviceRow.price) || 0;
    const realDuration = Number(serviceRow.duration_minutes) || 60;

    const { data: existingRows, error: aptErr } = await supabase
      .from('appointments')
      .select('id, barber_id, service_id, date_string, time_slot, duration_minutes, status, created_at')
      .eq('shop_id', SHOP_UUID)
      .eq('barber_id', barberRow.id)
      .eq('date_string', cleanDate)
      .neq('status', 'cancelado');

    if (aptErr) {
      return NextResponse.json({ error: 'Error verificando disponibilidad.' }, { status: 500 });
    }

    const existingMapped: AppointmentItem[] = (existingRows || []).map((r) => ({
      id: r.id,
      code: '',
      serviceId: r.service_id,
      serviceName: '',
      servicePrice: 0,
      durationMinutes: Number(r.duration_minutes) || 60,
      barberId: r.barber_id,
      barberName: '',
      dateString: r.date_string,
      timeSlot: r.time_slot,
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      status: r.status || 'confirmado',
      createdAt: r.created_at,
    }));

    const available = isSlotAvailable({
      candidateTime: cleanTime,
      serviceDurationMinutes: realDuration,
      barberId: barberRow.id,
      dateString: cleanDate,
      existingAppointments: existingMapped,
      allServices: [
        {
          id: serviceRow.id,
          name: serviceRow.name,
          price: realPrice,
          durationMinutes: realDuration,
          description: '',
          active: true,
        } as ServiceItem,
      ],
    });

    if (!available) {
      return NextResponse.json(
        {
          error:
            'Este horario acaba de ser ocupado o no cuenta con tiempo suficiente para la duración del servicio elegido. Por favor elegí otro horario.',
        },
        { status: 409 }
      );
    }

    const randomCode = `${SHOP_PREFIX}-` + randomBytes(8).toString('hex').toUpperCase();

    const insertPayload: Record<string, any> = {
      shop_id: SHOP_UUID,
      code: randomCode,
      service_id: serviceRow.id,
      barber_id: barberRow.id,
      date_string: cleanDate,
      time_slot: cleanTime,
      duration_minutes: realDuration,
      client_name: cleanName,
      client_phone: cleanPhone,
      client_email: cleanEmail,
      client_notes: cleanNotes,
      price_snapshot: realPrice,
      status: 'confirmado',
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('appointments')
      .insert([insertPayload])
      .select('id,code,created_at')
      .single();

    if (insertErr?.code === '23505' || insertErr?.code === '23P01') {
      // La restricción SQL es la última defensa contra reservas simultáneas.
      return NextResponse.json(
        {error: 'Este horario acaba de ocuparse. Elegí otro horario.'},
        {status: 409}
      );
    }
    if (insertErr || !inserted) {
      console.error('No se pudo insertar el turno:', insertErr?.code);
      return NextResponse.json(
        { error: 'No se pudo guardar el turno. Intentá nuevamente.' },
        { status: 400 }
      );
    }

    const confirmed: AppointmentItem = {
      id: inserted.id,
      code: inserted.code || randomCode,
      serviceId: serviceRow.id,
      serviceName: serviceRow.name,
      servicePrice: realPrice,
      priceSnapshot: realPrice,
      durationMinutes: realDuration,
      barberId: barberRow.id,
      barberName: barberRow.name,
      dateString: cleanDate,
      timeSlot: cleanTime,
      clientName: cleanName,
      clientPhone: cleanPhone,
      clientEmail: cleanEmail, // 👈 Incluido obligatoriamente
      clientNotes: cleanNotes,
      status: 'confirmado',
      createdAt: inserted.created_at || new Date().toISOString(),
    };

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      // El turno ya quedó persistido. El envío SMTP no debe bloquear la
      // confirmación en pantalla; Next/Vercel esperan este callback tras responder.
      after(async () => {
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.zoho.com',
            port: Number(process.env.SMTP_PORT) || 465,
            secure: true,
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 10000,
            auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASS},
          });
          const safe = (value: unknown) => String(value || '').replace(/[&<>"']/g, (c) =>
            ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
          await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: cleanEmail,
            subject: 'Confirmación de turno - 13-Cut',
            html: '<h2>Reserva confirmada</h2><p>Hola ' + safe(cleanName) +
              '</p><p>Servicio: ' + safe(serviceRow.name) + '</p><p>Barbero: ' +
              safe(barberRow.name) + '</p><p>Fecha: ' + safe(cleanDate) +
              '</p><p>Hora: ' + safe(cleanTime) + '</p><p>Código: ' + safe(confirmed.code) + '</p>',
          });
        } catch (mailError) {
          console.error('No se pudo enviar la confirmación de la reserva', mailError);
        }
      });
    }

    return NextResponse.json({ appointment: confirmed }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error procesando la reserva.' },
      { status: 500 }
    );
  }
}