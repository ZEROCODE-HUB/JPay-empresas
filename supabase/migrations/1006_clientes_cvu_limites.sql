-- ============================================================================
-- 1006_clientes_cvu_limites.sql
-- Agrega a clientes los campos de CVU madre y limites operativos (hoy estaban
-- hardcodeados en la UI de /app/cuenta). Tambien habilita que el cliente
-- autenticado actualice su propia fila.
-- ============================================================================

alter table public.clientes add column if not exists cbu                 text;
alter table public.clientes add column if not exists alias               text;
alter table public.clientes add column if not exists telefono            text;
alter table public.clientes add column if not exists actividad           text;
alter table public.clientes add column if not exists limite_transferencia numeric(18,2);
alter table public.clientes add column if not exists limite_ops_diarias   integer;
alter table public.clientes add column if not exists limite_monto_diario  numeric(18,2);

-- El cliente autenticado puede actualizar su propia fila (por correo).
drop policy if exists clientes_cliente_update on public.clientes;
create policy clientes_cliente_update on public.clientes
  for update to authenticated
  using (correo = auth.email())
  with check (correo = auth.email());
