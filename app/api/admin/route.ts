// app/api/admin/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import { requireAdminSession, verifyCsrfOrigin } from '@/lib/session';
import { requireOpenCash } from '@/lib/cash-guard';
import {appointmentTimeState} from '@/lib/appointment-rules';
import {
  generateUUID,
  isValidUUID,
  sanitizeInput,
  ExpenseCategory,
  DEFAULT_SHOP_CONFIG,
} from '@/lib/booking-store';

const VALID_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Insumos',
  'Alquiler / Servicios',
  'Adelantos / Sueldos',
  'Marketing',
  'Otros',
];

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const resource = searchParams.get('resource');
    const supabase = getSupabaseServer();

    if (resource === 'services') {
      const {data, error} = await supabase.from('services')
        .select('id,name,price,duration_minutes,description,image_url,active')
        .eq('shop_id', SHOP_UUID);
      if (error) return NextResponse.json({error: 'No se pudieron cargar los servicios'}, {status: 500});
      return NextResponse.json({data: data || []});
    }

    if (resource === 'cash_registers') {
      const {data, error} = await supabase.from('cash_registers')
        .select('id,status,closed_at,opened_at')
        .eq('shop_id', SHOP_UUID)
        .order('opened_at', {ascending: false})
        .limit(1);
      if (error) return NextResponse.json({error: 'No se pudo consultar caja'}, {status: 500});
      return NextResponse.json({data: data || []});
    }

    if (resource === 'barbers') {
      const { data, error } = await supabase
        .from('barbers')
        .select('id,slug,name,role,bio,specialties,service_ids,active,commission_rate,is_owner')
        .eq('shop_id', SHOP_UUID);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ data: data || [] });
    }

    if (resource === 'appointments') {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, services(name, price, duration_minutes), barbers(name)')
        .eq('shop_id', SHOP_UUID)
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ data: data || [] });
    }

    if (resource === 'expenses') {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('shop_id', SHOP_UUID)
        .order('expense_date', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ data: data || [] });
    }

    return NextResponse.json({ error: 'Recurso inválido.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error interno.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'Origen no permitido (CSRF).' }, { status: 403 });
  }

  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado. Iniciá sesión como administrador.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { operation } = body;
    const supabase = getSupabaseServer();

    switch (operation) {
      case 'UNBLOCK_BARBER_PIN': {
        const barberId = String(body.barberId || '');
        if (!isValidUUID(barberId)) {
          return NextResponse.json({error: 'ID de barbero inválido.'}, {status: 400});
        }

        // No confiar en un ID enviado por el navegador: validar pertenencia al negocio.
        const {data: barber, error: barberError} = await supabase
          .from('barbers').select('id').eq('id', barberId)
          .eq('shop_id', SHOP_UUID).maybeSingle();
        if (barberError) return NextResponse.json({error: 'Error verificando el barbero.'}, {status: 500});
        if (!barber) return NextResponse.json({error: 'Barbero no encontrado.'}, {status: 404});

        const {error} = await supabase.from('audit_logs').delete()
          .eq('shop_id', SHOP_UUID)
          .eq('action', 'PIN_FAILED')
          .eq('details', barberId);
        if (error) return NextResponse.json({error: 'No se pudo desbloquear el PIN.'}, {status: 500});
        return NextResponse.json({ok: true});
      }
      case 'OPEN_CASH': {
        const total = Number(body.initialAmount);
        if (!Number.isFinite(total) || total < 0) {
          return NextResponse.json({error: 'Monto inicial inválido.'}, {status: 400});
        }
        const {data: openRows, error: lookupError} = await supabase.from('cash_registers')
          .select('id')
          .eq('shop_id', SHOP_UUID)
          .eq('status', 'abierta')
          .limit(1);
        if (lookupError) {
          return NextResponse.json({error: 'No se pudo verificar el estado de caja.'}, {status: 500});
        }
        if (openRows?.length) {
          return NextResponse.json({error: 'Ya existe una caja abierta para este negocio.'}, {status: 409});
        }

        // La verificación anterior mejora UX; el índice único parcial en PostgreSQL
        // es la protección real contra dos aperturas simultáneas.
        const {error} = await supabase.from('cash_registers').insert({
          shop_id: SHOP_UUID, initial_amount: total,
          total_sales: total, status: 'abierta',
        });
        if (error?.code === '23505') {
          return NextResponse.json({error: 'Ya existe una caja abierta para este negocio.'}, {status: 409});
        }
        if (error) return NextResponse.json({error: 'No se pudo abrir caja.'}, {status: 500});
        return NextResponse.json({ok: true});
      }
      case 'CLOSE_CASH': {
        // Calcular el cierre dentro de una transacción SQL bloqueando la caja.
        // Nunca confiar en importes enviados por el navegador.
        const {data, error} = await supabase.rpc('close_cash_financial', {
          p_shop_id: SHOP_UUID,
        });
        if (error) {
          console.error('No se pudo consolidar la caja:', error.code);
          return NextResponse.json({error: 'No se pudo consolidar la caja. Actualizá e intentá nuevamente.'}, {status: 409});
        }
        return NextResponse.json({ok: true, summary: data});
      }
      case 'SAVE_BARBERS': {
        const items = Array.isArray(body.barbers) ? body.barbers : [];
        if (items.length > 100) return NextResponse.json({error: 'Demasiados barberos en una operación.'}, {status: 400});
        // Validar toda la lista antes de escribir. Una única operación SQL
        // sustituye las N upserts secuenciales y evita guardados parciales.
        const payloads = [];
        for (const b of items) {
          const id = isValidUUID(b.id) ? b.id : generateUUID();
          const name = sanitizeInput(String(b.name || '')).slice(0, 80);
          if (!name) {
            return NextResponse.json({error: 'El nombre del barbero es obligatorio.'}, {status: 400});
          }
          const slug = sanitizeInput(String(b.slug || '')) ||
            name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
          const commissionRate = Math.min(100, Math.max(0, Number(b.commissionRate ?? 50)));
          const pin = String(b.pin ?? '').trim();
          if (pin && (!/^\d{4,6}$/.test(pin) || pin === '1234')) {
            return NextResponse.json({error: 'El PIN nuevo debe tener de 4 a 6 dígitos y no puede ser 1234.'}, {status: 400});
          }
          const serviceIds = Array.isArray(b.serviceIds)
            ? b.serviceIds.filter((sid: string) => isValidUUID(sid))
            : [];
          const specialties = Array.isArray(b.specialties)
            ? b.specialties.map((sp: string) => sanitizeInput(String(sp)).slice(0, 40))
            : ['Corte'];

          payloads.push({
            id, shop_id: SHOP_UUID, slug, name,
            role: sanitizeInput(String(b.role || 'Barbero')).slice(0, 40),
            bio: sanitizeInput(String(b.bio || '')).slice(0, 300),
            specialties, service_ids: serviceIds,
            commission_rate: commissionRate, is_owner: b.isOwner === true,
            pin, active: b.active ?? true,
          });
        }
        if (payloads.length) {
          const {data: existing, error: ownershipError} = await supabase.from('barbers')
            .select('id,shop_id,pin').in('id', payloads.map(item => item.id));
          if (ownershipError) return NextResponse.json({error: 'No se pudo verificar la pertenencia de los barberos.'}, {status: 503});
          if (existing?.some(row => row.shop_id !== SHOP_UUID)) {
            return NextResponse.json({error: 'Un barbero pertenece a otro negocio.'}, {status: 403});
          }
          const existingPins = new Map((existing || []).map(row => [row.id, row.pin]));
          for (const item of payloads) {
            if (!item.pin) item.pin = existingPins.get(item.id) || '';
            if (!/^\d{4,6}$/.test(item.pin)) {
              return NextResponse.json({error: 'Definí un PIN para cada barbero nuevo.'}, {status: 400});
            }
          }
          const {error} = await supabase.from('barbers')
            .upsert(payloads, {onConflict: 'id'});
          if (error) {
            console.error('Error guardando barberos en lote:', error.code);
            return NextResponse.json({error: 'No se pudieron guardar los barberos.'}, {status: 400});
          }
        }
        return NextResponse.json({ok: true});
      }
      case 'DELETE_BARBER': {
        const id = String(body.id || '');
        if (!isValidUUID(id)) {
          return NextResponse.json({ error: 'ID de barbero inválido.' }, { status: 400 });
        }
        // No borrar historial por las FK ON DELETE CASCADE existentes.
        const barberUsage = await Promise.all([
          supabase.from('appointments').select('id', {count:'exact',head:true}).eq('shop_id',SHOP_UUID).eq('barber_id',id),
          supabase.from('manual_charges').select('id', {count:'exact',head:true}).eq('shop_id',SHOP_UUID).eq('barber_id',id),
          supabase.from('tips').select('id', {count:'exact',head:true}).eq('shop_id',SHOP_UUID).eq('barber_id',id),
        ]);
        if (barberUsage.some(row => row.error)) return NextResponse.json({error:'No se pudo verificar el historial del barbero.'},{status:500});
        if (barberUsage.some(row => (row.count || 0)>0)) {
          return NextResponse.json({error:'Este barbero tiene historial. Desactivalo en lugar de eliminarlo.'},{status:409});
        }
        const { error } = await supabase
          .from('barbers')
          .delete()
          .eq('id', id)
          .eq('shop_id', SHOP_UUID);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }

      case 'SAVE_SERVICES': {
        const items = Array.isArray(body.services) ? body.services : [];
        if (items.length > 100) return NextResponse.json({error: 'Demasiados servicios en una operación.'}, {status: 400});
        // Una sola transacción PostgREST; los valores quedan todos validados
        // antes de tocar la base de datos.
        const payloads = [];
        for (const service of items) {
          const id = isValidUUID(service.id) ? service.id : generateUUID();
          const name = sanitizeInput(String(service.name || '')).slice(0, 80);
          if (!name) {
            return NextResponse.json({error: 'El nombre del servicio es obligatorio.'}, {status: 400});
          }
          const price = Math.max(0, Number(service.price) || 0);
          const durationMinutes = Math.max(15, Number(service.durationMinutes) || 60);
          payloads.push({
            id, shop_id: SHOP_UUID, name, price,
            duration_minutes: durationMinutes,
            description: sanitizeInput(
              String(service.description || `${durationMinutes} min`)
            ).slice(0, 120),
            image_url: service.imageUrl ? String(service.imageUrl).slice(0, 500) : null,
            active: service.active ?? true,
          });
        }
        if (payloads.length) {
          const {data: existing, error: ownershipError} = await supabase.from('services')
            .select('id,shop_id').in('id', payloads.map(item => item.id));
          if (ownershipError) return NextResponse.json({error: 'No se pudo verificar la pertenencia de los servicios.'}, {status: 503});
          if (existing?.some(row => row.shop_id !== SHOP_UUID)) {
            return NextResponse.json({error: 'Un servicio pertenece a otro negocio.'}, {status: 403});
          }
          const {error} = await supabase.from('services')
            .upsert(payloads, {onConflict: 'id'});
          if (error) {
            console.error('Error guardando servicios en lote:', error.code);
            return NextResponse.json({error: 'No se pudieron guardar los servicios.'}, {status: 400});
          }
        }
        return NextResponse.json({ok: true});
      }
      case 'DELETE_SERVICE': {
        const id = String(body.id || '');
        if (!isValidUUID(id)) {
          return NextResponse.json({ error: 'ID de servicio inválido.' }, { status: 400 });
        }
        const {count, error: historyError} = await supabase.from('appointments')
          .select('id', {count:'exact',head:true}).eq('shop_id',SHOP_UUID).eq('service_id',id);
        if (historyError) return NextResponse.json({error:'No se pudo verificar el historial del servicio.'},{status:500});
        if ((count || 0)>0) return NextResponse.json({error:'Este servicio tiene historial. Desactivalo en lugar de eliminarlo.'},{status:409});
        const { error } = await supabase
          .from('services')
          .delete()
          .eq('id', id)
          .eq('shop_id', SHOP_UUID);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }

      case 'SAVE_SHOP_CONFIG': {
        const cfg = body.config || {};
        const name = sanitizeInput(String(cfg.name || '')).slice(0, 80);
        const address = sanitizeInput(String(cfg.address || '')).slice(0, 150);
        const city = sanitizeInput(String(cfg.city || 'Montevideo')).slice(0, 80);
        const phone = sanitizeInput(String(cfg.phone || '')).slice(0, 30);
        const tagline = sanitizeInput(String(cfg.tagline || address)).slice(0, 150);
        const backgroundImageUrl = cfg.backgroundImageUrl
          ? String(cfg.backgroundImageUrl).trim().slice(0, 500)
          : null;
        const logoUrl = cfg.logoUrl ? String(cfg.logoUrl).trim().slice(0, 500) : null;
        const coverImageUrl = cfg.coverImageUrl
          ? String(cfg.coverImageUrl).trim().slice(0, 500)
          : backgroundImageUrl;
        const schedule = cfg.schedule || DEFAULT_SHOP_CONFIG.schedule;

        const updatePayload: Record<string, any> = {
          name,
          address,
          city,
          phone,
          tagline,
          background_image_url: backgroundImageUrl,
          logo_url: logoUrl,
          cover_image_url: coverImageUrl,
          schedule,
        };

        const { error } = await supabase
          .from('shops')
          .update(updatePayload)
          .eq('id', SHOP_UUID);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }

      case 'UPDATE_APPOINTMENT_STATUS': {
        const id = String(body.id || '');
        const status = body.status;
        if (!isValidUUID(id) || !['completado', 'cancelado'].includes(status)) {
          return NextResponse.json({ error: 'Datos de turno inválidos.' }, { status: 400 });
        }
        const {data: current, error: lookupError} = await supabase
          .from('appointments')
          .select('status,date_string,time_slot,created_at')
          .eq('id', id)
          .eq('shop_id', SHOP_UUID)
          .maybeSingle();
        if (lookupError) return NextResponse.json({error: 'No se pudo consultar el turno.'}, {status: 500});
        if (!current) return NextResponse.json({error: 'Turno inexistente.'}, {status: 404});
        if (current.status !== 'confirmado') {
          return NextResponse.json({error: 'Solo se puede modificar un turno confirmado una vez.'}, {status: 409});
        }
        const timeState = appointmentTimeState({
          dateString: current.date_string, timeSlot: current.time_slot,
          createdAt: current.created_at,
        });
        if (status === 'cancelado' && timeState !== 'future') {
          return NextResponse.json({error: 'El horario ya comenzó o pasó; no se puede cancelar.'}, {status: 409});
        }
        if (status === 'completado' && timeState !== 'started') {
          return NextResponse.json({error: 'No se puede completar un turno futuro o con fecha inválida.'}, {status: 409});
        }
        if (status === 'completado') {
          const cashDenied = await requireOpenCash();
          if (cashDenied) return cashDenied;
        }

        const { data, error } = await supabase
          .from('appointments')
          .update({ status })
          .eq('id', id)
          .eq('shop_id', SHOP_UUID)
          .eq('status', 'confirmado')
          .select('id');
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (!data?.length) return NextResponse.json({error: 'El turno ya cambió de estado.'}, {status: 409});
        return NextResponse.json({ ok: true });
      }

      case 'CREATE_EXPENSE': {
        const exp = body.expense || {};
        const description = sanitizeInput(String(exp.description || '')).slice(0, 150);
        const amount = Number(exp.amount);
        const category = VALID_EXPENSE_CATEGORIES.includes(exp.category)
          ? exp.category
          : 'Insumos';
        const expenseDate = sanitizeInput(
          String(exp.date || new Date().toISOString().split('T')[0])
        ).slice(0, 20);

        if (!description || !Number.isFinite(amount) || amount <= 0) {
          return NextResponse.json(
            { error: 'Descripción y monto mayor a 0 son obligatorios.' },
            { status: 400 }
          );
        }

        const cashDenied = await requireOpenCash();
        if (cashDenied) return cashDenied;

        const { error } = await supabase.from('expenses').insert([
          {
            shop_id: SHOP_UUID,
            description,
            amount,
            category,
            expense_date: expenseDate,
          },
        ]);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }

      case 'DELETE_EXPENSE': {
        const id = String(body.id || '');
        if (!isValidUUID(id)) {
          return NextResponse.json({ error: 'ID de gasto inválido.' }, { status: 400 });
        }
        const cashDenied = await requireOpenCash();
        if (cashDenied) return cashDenied;

        const { error } = await supabase
          .from('expenses')
          .delete()
          .eq('id', id)
          .eq('shop_id', SHOP_UUID);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Operación no reconocida.' }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
