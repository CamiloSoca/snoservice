-- ============================================================================
-- ESQUEMA SAAS MULTI-BARBERÍA (POSTGRESQL / SUPABASE)
-- Escalable: soporta múltiples sucursales, servicios, barberos, clientes y turnos
-- ============================================================================

-- 1. Tabla de Barberías (Multi-tenant: te permite venderle el SaaS a varias barberías)
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL, -- ej: 'barberia-central'
  name TEXT NOT NULL,
  tagline TEXT,
  address TEXT,
  city TEXT DEFAULT 'Montevideo',
  phone TEXT,
  instagram_handle TEXT,
  opening_hours TEXT DEFAULT 'Lun a Sáb: 10:00 - 20:00 hs',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Servicios (Cortes, Barba, Combos, Color)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de Barberos / Profesionales
CREATE TABLE IF NOT EXISTS barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Master Barber',
  phone TEXT,
  avatar_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de Clientes (Se alimenta sola cada vez que alguien agenda)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT,
  total_visits INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, phone)
);

-- 5. Tabla de Turnos (Appointments)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_notes TEXT,
  appointment_date TEXT NOT NULL, -- ej: '2026-10-14'
  time_slot TEXT NOT NULL,        -- ej: '10:30'
  price_snapshot NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado', 'completado', 'cancelado')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice único parcial: Impide que dos personas reserven el mismo barbero el mismo día y hora si no está cancelado
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_slot 
ON appointments (barber_id, appointment_date, time_slot) 
WHERE status != 'cancelado';

-- 1. Nuevas columnas en la tabla barbers (Comisión y PIN de acceso)
ALTER TABLE barbers 
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS pin TEXT NOT NULL DEFAULT '1234';

-- 2. Asegurar price_snapshot en la tabla appointments
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS price_snapshot NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- 3. Nueva tabla de Gastos Operativos / Egresos (expenses)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'Insumos',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_shop_date ON expenses (shop_id, expense_date);