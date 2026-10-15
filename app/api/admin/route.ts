// app/api/admin/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import { requireAdminSession, verifyCsrfOrigin } from '@/lib/session';
import {
  generateUUID,
  isValidUUID,
  sanitizeInput,
  ExpenseCategory,
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

    if (resource === 'barbers') {
      const { data, error } = await supabase
        .from('barbers')
        .select('*')
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
    return NextResponse.json({ error: 'No autorizado. Iniciá sesión como administrador.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { operation } = body;
    const supabase = getSupabaseServer();

    switch (operation) {
      case 'SAVE_BARBERS': {
        const items = Array.isArray(body.barbers) ? body.barbers : [];
        for (const b of items) {
          const id = isValidUUID(b.id) ? b.id : generateUUID();
          const name = sanitizeInput(String(b.name || '')).slice(0, 80);
          if (!name) {
            return NextResponse.json({ error: 'El nombre del barbero es obligatorio.' }, { status: 400 });
          }
          const slug =
            sanitizeInput(String(b.slug || '')) ||
            name
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\s+/g, '-');

          const commissionRate = Math.min(100, Math.max(0, Number(b.commissionRate ?? 50)));
          const pin = String(b.pin || '1234').trim().slice(0, 4) || '1234';
          const serviceIds = Array.isArray(b.serviceIds)
            ? b.serviceIds.filter((sid: string) => isValidUUID(sid))
            : [];
          const specialties = Array.isArray(b.specialties)
            ? b.specialties.map((sp: string) => sanitizeInput(String(sp)).slice(0, 40))
            : ['Corte'];

          const payload = {
            id,
            shop_id: SHOP_UUID,
            slug,
            name,
            role: sanitizeInput(String(b.role || 'Barbero')).slice(0, 40),
            bio: sanitizeInput(String(b.bio || '')).slice(0, 300),
            specialties,
            service_ids: serviceIds,
            commission_rate: commissionRate,
            pin,
            active: b.active ?? true,
          };

          const { error } = await supabase.from('barbers').upsert(payload, { onConflict: 'id' });
          if (error) {
            return NextResponse.json(
              { error: `Error al guardar barbero ${name}: ${error.message}` },
              { status: 400 }
            );
          }
        }
        return NextResponse.json({ ok: true });
      }

      case 'DELETE_BARBER': {
        const id = String(body.id || '');
        if (!isValidUUID(id)) {
          return NextResponse.json({ error: 'ID de barbero inválido.' }, { status: 400 });
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
        for (const s of items) {
          const id = isValidUUID(s.id) ? s.id : generateUUID();
          const name = sanitizeInput(String(s.name || '')).slice(0, 80);
          if (!name) {
            return NextResponse.json({ error: 'El nombre del servicio es obligatorio.' }, { status: 400 });
          }
          const price = Math.max(0, Number(s.price) || 0);
          const durationMinutes = Math.max(15, Number(s.durationMinutes) || 60);

          const payload = {
            id,
            shop_id: SHOP_UUID,
            name,
            price,
            duration_minutes: durationMinutes,
            description: sanitizeInput(String(s.description || `${durationMinutes} min`)).slice(0, 120),
            image_url: s.imageUrl ? String(s.imageUrl).slice(0, 500) : null,
            active: s.active ?? true,
          };

          const { error } = await supabase.from('services').upsert(payload, { onConflict: 'id' });
          if (error) {
            return NextResponse.json(
              { error: `Error al guardar servicio ${name}: ${error.message}` },
              { status: 400 }
            );
          }
        }
        return NextResponse.json({ ok: true });
      }

      case 'DELETE_SERVICE': {
        const id = String(body.id || '');
        if (!isValidUUID(id)) {
          return NextResponse.json({ error: 'ID de servicio inválido.' }, { status: 400 });
        }
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
        const phone = sanitizeInput(String(cfg.phone || '')).slice(0, 30);
        const tagline = sanitizeInput(String(cfg.tagline || address)).slice(0, 150);
        const backgroundImageUrl = cfg.backgroundImageUrl
          ? String(cfg.backgroundImageUrl).trim().slice(0, 500)
          : null;

        const { error } = await supabase
          .from('shops')
          .update({
            name,
            address,
            phone,
            tagline,
            background_image_url: backgroundImageUrl,
          })
          .eq('id', SHOP_UUID);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }

      case 'UPDATE_APPOINTMENT_STATUS': {
        const id = String(body.id || '');
        const status = body.status;
        if (!isValidUUID(id) || !['confirmado', 'completado', 'cancelado'].includes(status)) {
          return NextResponse.json({ error: 'Datos de turno inválidos.' }, { status: 400 });
        }
        const { error } = await supabase
          .from('appointments')
          .update({ status })
          .eq('id', id)
          .eq('shop_id', SHOP_UUID);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }

      case 'CREATE_EXPENSE': {
        const exp = body.expense || {};
        const description = sanitizeInput(String(exp.description || '')).slice(0, 150);
        const amount = Number(exp.amount);
        const category = VALID_EXPENSE_CATEGORIES.includes(exp.category)
          ? exp.category
          : 'Insumos';
        const expenseDate = sanitizeInput(String(exp.date || new Date().toISOString().split('T')[0])).slice(0, 20);

        if (!description || isNaN(amount) || amount <= 0) {
          return NextResponse.json({ error: 'Descripción y monto mayor a 0 son obligatorios.' }, { status: 400 });
        }

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
    return NextResponse.json({ error: err?.message || 'Error interno del servidor.' }, { status: 500 });
  }
}