-- ============================================================================
-- 1013_otp_transferencias.sql
-- OTP para confirmar transferencias vía email (Resend).
-- Flujo: enviar-otp-transferencia genera código 6 dígitos, lo persiste 10min
-- y lo envía por correo; verificar-otp-transferencia valida y marca usado.
-- La tabla solo es accesible vía service_role (edge functions bypass RLS).
-- ============================================================================

create table if not exists public.otp_transferencias (
  id uuid primary key default gen_random_uuid(),
  correo text not null,
  codigo text not null check (char_length(codigo) = 6),
  expires_at timestamptz not null,
  usado boolean not null default false,
  intentos smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_otp_transferencias_correo on public.otp_transferencias(correo, expires_at desc);
create index if not exists idx_otp_transferencias_codigo on public.otp_transferencias(correo, codigo);

alter table public.otp_transferencias enable row level security;

drop policy if exists otp_transferencias_no_direct on public.otp_transferencias;
-- Deniega acceso directo a anon/authenticated; solo service_role vía edge functions
create policy otp_transferencias_no_direct on public.otp_transferencias
  for all to authenticated, anon
  using (false) with check (false);
