// app/api/public/booking/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import {
  isSlotAvailable,
  isValidUUID,
  isValidUruguayanPhone,
  sanitizeInput,
  AppointmentItem,
  ServiceItem,
} from '@/lib/booking-store';

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('appointments')
      .select('id, barber_id, service_id, date_string, time_slot, duration_minutes, status, created_at')
      .eq('shop_id', SHOP_UUID)
      .neq('status', 'cancelado')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'No se pudo consultar la disponibilidad.' }, { status: 500 });
    }

    // Devuelve solo horarios ocupados, CERO datos personales de clientes
    const sanitizedSlots: AppointmentItem[] = (data || []).map((apt) => ({
      id: apt.id,
      code: '',
      serviceId: apt.service_id,
      serviceName: '',
      servicePrice: 0,
      priceSnapshot: 0,
      durationMinutes: Number(apt.duration_minutes) || 60,
      barberId: apt.barber_id,
      barberName: '',
      dateString: apt.date_string,
      timeSlot: apt.time_slot,
      clientName: '',
      clientPhone: '',
      clientNotes: '',
      status: apt.status || 'confirmado',
      createdAt: apt.created_at,
    }));

    return NextResponse.json({ appointments: sanitizedSlots });
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
    const { serviceId, barberId, dateString, timeSlot, clientName, clientPhone, clientNotes } = body;

    if (!isValidUUID(serviceId) || !isValidUUID(barberId)) {
      return NextResponse.json({ error: 'Servicio o barbero inválido.' }, { status: 400 });
    }

    const cleanName = sanitizeInput(String(clientName || '')).slice(0, 80);
    const cleanPhone = sanitizeInput(String(clientPhone || '')).slice(0, 25);
    const cleanNotes = sanitizeInput(String(clientNotes || '')).slice(0, 300);
    const cleanDate = sanitizeInput(String(dateString || '')).slice(0, 30);
    const cleanTime = sanitizeInput(String(timeSlot || '')).slice(0, 10);

    if (cleanName.length < 3 || !isValidUruguayanPhone(cleanPhone)) {
      return NextResponse.json(
        { error: 'Ingresá tu nombre y un celular uruguayo válido (ej: 098 509 376).' },
        { status: 400 }
      );
    }

    if (!/^\d{2}:\d{2}$/.test(cleanTime) || !cleanDate) {
      return NextResponse.json({ error: 'Fecha u horario inválido.' }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    // 1. Verificar servicio y barbero reales y activos en el servidor
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
      return NextResponse.json({ error: 'El servicio seleccionado no está disponible.' }, { status: 400 });
    }

    if (brbErr || !barberRow || !barberRow.active) {
      return NextResponse.json({ error: 'El barbero seleccionado no está disponible.' }, { status: 400 });
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

    // 2. Comprobar disponibilidad real en el servidor contra turnos existentes
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

    const randomCode = '13C-' + Math.floor(1000 + Math.random() * 9000);

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
      client_notes: cleanNotes,
      price_snapshot: realPrice,
      status: 'confirmado',
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('appointments')
      .insert([insertPayload])
      .select()
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: `No se pudo guardar el turno: ${insertErr?.message || 'Error interno'}` },
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
      clientNotes: cleanNotes,
      status: 'confirmado',
      createdAt: inserted.created_at || new Date().toISOString(),
    };

    return NextResponse.json({ appointment: confirmed }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error procesando la reserva.' },
      { status: 500 }
    );
  }
}