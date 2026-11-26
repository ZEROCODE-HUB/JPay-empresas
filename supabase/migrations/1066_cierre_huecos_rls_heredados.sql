-- Cierre de huecos de acceso heredados de MoliPay (26/11/2026).
--
-- Auditoría del catálogo real (políticas con `using (true)`, vistas sin `security_invoker`,
-- políticas de Storage). Cada hueco se reprodujo simulando el rol antes de aplicar esto:
--   · un ANÓNIMO (solo con la clave pública) leía `caja_molipay` y podía modificar o borrar
--     `tipos_movimiento`, `contracargos`, `deudas_comercio`, `liquidaciones_*`, etc.;
--   · un ANÓNIMO leía `v_lotes_venta` (ventas agregadas de todos los comercios);
--   · un cliente con sesión leía (y podía alterar) el historial de estados de las transacciones
--     de otros clientes;
--   · un cliente con sesión podía listar y descargar los documentos KYC de otros clientes.
-- Ninguna pantalla ni función dependía de esos permisos: los documentos se sirven con enlaces
-- firmados por las Edge Functions `doc-url` (portal) y `get-document-url` (admin), y esas tablas
-- solo las tocan funciones SECURITY DEFINER, el service role o un administrador.
-- No borra datos: solo quita políticas demasiado abiertas y deja las correctas.

-- ── 1. Tablas: fuera las políticas «todo para todos» ────────────────────────
drop policy if exists caja_molipay_all on public.caja_molipay;
drop policy if exists caja_movimientos_all on public.caja_movimientos;
drop policy if exists comercio_establecimientos_all on public.comercio_establecimientos;
drop policy if exists contracargos_all on public.contracargos;
drop policy if exists deudas_comercio_all on public.deudas_comercio;
drop policy if exists liquidaciones_importaciones_all on public.liquidaciones_importaciones;
drop policy if exists liquidaciones_renglones_all on public.liquidaciones_renglones;
drop policy if exists tipos_movimiento_all on public.tipos_movimiento;
drop policy if exists lotes_venta_all on public.lotes_venta;
drop policy if exists authenticated_all_transaction_status_history
  on public.transaction_status_history;
drop policy if exists comercio_banderas_anon_select on public.comercio_banderas;
drop policy if exists lotes_acreditacion_anon_read on public.lotes_acreditacion;

-- Las que quedaban sin ninguna política: solo administradores (como sus tablas hermanas).
drop policy if exists comercio_establecimientos_admin on public.comercio_establecimientos;
create policy comercio_establecimientos_admin on public.comercio_establecimientos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lotes_venta_admin on public.lotes_venta;
create policy lotes_venta_admin on public.lotes_venta
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Catálogo de tipos de movimiento: lo lee cualquier usuario con sesión; lo cambia un admin.
drop policy if exists tipos_movimiento_select on public.tipos_movimiento;
create policy tipos_movimiento_select on public.tipos_movimiento
  for select to authenticated using (true);
drop policy if exists tipos_movimiento_admin on public.tipos_movimiento;
create policy tipos_movimiento_admin on public.tipos_movimiento
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Un anónimo no tiene nada que hacer en estas tablas (defensa en profundidad).
revoke all on public.caja_molipay from anon;
revoke all on public.caja_movimientos from anon;
revoke all on public.comercio_establecimientos from anon;
revoke all on public.contracargos from anon;
revoke all on public.deudas_comercio from anon;
revoke all on public.liquidaciones_importaciones from anon;
revoke all on public.liquidaciones_renglones from anon;
revoke all on public.tipos_movimiento from anon;
revoke all on public.lotes_venta from anon;
revoke all on public.transaction_status_history from anon;
revoke all on public.comercio_banderas from anon;
revoke all on public.lotes_acreditacion from anon;

-- ── 2. Vistas que saltaban RLS ──────────────────────────────────────────────
-- `v_lotes_venta` agrega `transactions` por comercio: con `security_invoker` cada quien ve solo
-- lo que las políticas de `transactions` y `comercios` le permiten.
alter view public.v_lotes_venta set (security_invoker = true);
revoke all on public.v_lotes_venta from anon;
-- `v_security_summary` es un resumen interno del catálogo: nadie lo usa desde el navegador.
revoke all on public.v_security_summary from anon, authenticated;

-- ── 3. Storage ──────────────────────────────────────────────────────────────
-- KYC: cualquier usuario con sesión podía leer todo el bucket. Ahora cada cliente solo su
-- carpeta (`<legajo>/…`); el backoffice sigue leyendo con la política «Admins leen kyc».
drop policy if exists kyc_select_authenticated on storage.objects;
drop policy if exists kyc_select_propio on storage.objects;
create policy kyc_select_propio on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc'
    and (storage.foldername(name))[1] = public.current_cliente_legajo()
  );

-- Conciliaciones (archivos internos del backoffice): cualquier usuario con sesión podía leer,
-- subir, reemplazar y borrar. Ahora solo el backoffice.
drop policy if exists authenticated_read_conciliaciones on storage.objects;
drop policy if exists authenticated_upload_conciliaciones on storage.objects;
drop policy if exists authenticated_update_conciliaciones on storage.objects;
drop policy if exists authenticated_delete_conciliaciones on storage.objects;
drop policy if exists conciliaciones_backoffice on storage.objects;
create policy conciliaciones_backoffice on storage.objects
  for all to authenticated
  using (bucket_id = 'conciliaciones' and public.es_backoffice())
  with check (bucket_id = 'conciliaciones' and public.es_backoffice());
