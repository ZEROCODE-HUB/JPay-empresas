-- ============================================================================
-- 1005_subcuentas_rls_cliente.sql
-- El cliente dueño (correo = auth.email() via cliente_legajo) puede gestionar
-- sus propias subcuentas. Se suma a la politica admin-only existente.
-- ============================================================================

drop policy if exists subcuentas_cliente_all on public.subcuentas;
create policy subcuentas_cliente_all on public.subcuentas
  as permissive for all to authenticated
  using (exists (
    select 1 from public.clientes c
    where c.legajo = subcuentas.cliente_legajo
      and c.correo = auth.email()
  ))
  with check (exists (
    select 1 from public.clientes c
    where c.legajo = subcuentas.cliente_legajo
      and c.correo = auth.email()
  ));
