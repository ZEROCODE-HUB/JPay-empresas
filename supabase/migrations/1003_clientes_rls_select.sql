-- ============================================================================
-- 1003_clientes_rls_select.sql  (el portal de empresas)
-- Permite al cliente autenticado leer su propia fila (por correo) para que el
-- login pueda consultar estado_onboarding sin violar RLS.
-- ============================================================================

drop policy if exists clientes_cliente_select on public.clientes;
create policy clientes_cliente_select on public.clientes
  for select to authenticated
  using (correo = auth.email());
