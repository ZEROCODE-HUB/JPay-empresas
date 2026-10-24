-- Permitir al titular ver sus propios movimientos (por legajo)
drop policy if exists "movimientos_cliente_select" on public.movimientos;
create policy "movimientos_cliente_select" on public.movimientos
  for select
  to authenticated
  using (
    legajo = (select c.legajo from public.clientes c where c.correo = auth.email())
  );
