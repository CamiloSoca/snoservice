-- Credencial profesional de Instagram, independiente de las reservas.
-- Únicamente el servidor (service_role) puede acceder. Nunca exponer a anon/authenticated.
create table if not exists public.instagram_connections (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  instagram_user_id text not null,
  username text not null,
  access_token_encrypted text not null,
  token_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.instagram_connections enable row level security;
revoke all on table public.instagram_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.instagram_connections to service_role;
