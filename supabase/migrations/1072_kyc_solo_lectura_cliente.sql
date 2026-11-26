-- KYC: el cliente solo lee sus documentos y validaciones (26/11/2026).
--
-- Las políticas heredadas dejaban al cliente insertar, cambiar y borrar sus filas de
-- `documentos` y `validaciones`, y borrar su `cliente_perfil_riesgo`. Con eso podía:
--  * crear un documento propio cuya `url` fuera la ruta del archivo KYC de otro cliente y pedirle
--    a `doc-url` el enlace firmado (ver las identificaciones de otros);
--  * cargarse una validación «Aprobada» o borrar su calificación de riesgo.
-- El portal nunca escribe en esas tablas (lo hace `crear-cliente` con service_role), así que se
-- agregan políticas RESTRICTIVE: escribir queda solo para el backoffice. Aditiva.

do $$
declare
  t text;
begin
  foreach t in array array['documentos', 'validaciones'] loop
    execute format('drop policy if exists %I on public.%I', t || '_escribe_backoffice_ins', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.es_backoffice())',
      t || '_escribe_backoffice_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_escribe_backoffice_upd', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.es_backoffice()) with check (public.es_backoffice())',
      t || '_escribe_backoffice_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_escribe_backoffice_del', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.es_backoffice())',
      t || '_escribe_backoffice_del', t);
  end loop;
end $$;

drop policy if exists cliente_perfil_riesgo_borra_backoffice on public.cliente_perfil_riesgo;
create policy cliente_perfil_riesgo_borra_backoffice on public.cliente_perfil_riesgo
  as restrictive for delete to authenticated using (public.es_backoffice());
