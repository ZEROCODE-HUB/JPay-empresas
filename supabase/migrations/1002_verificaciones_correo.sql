-- ============================================================================
-- 1002_verificaciones_correo.sql  (el portal de empresas)
-- Tokens de verificación de correo enviados por Resend al registrarse.
-- El edge function usa service_role (bypasea RLS); la tabla queda admin-only.
-- ============================================================================

create table if not exists public.verificaciones_correo (
  token       text primary key,
  user_id     uuid not null,
  correo      text not null,
  expires_at  timestamptz not null,
  usado       boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_verif_correo on public.verificaciones_correo (correo);

alter table public.verificaciones_correo enable row level security;

drop policy if exists verif_correo_admin_all on public.verificaciones_correo;
create policy verif_correo_admin_all on public.verificaciones_correo
  using (public.is_admin()) with check (public.is_admin());
