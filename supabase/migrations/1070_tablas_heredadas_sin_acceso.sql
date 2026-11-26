-- Tablas heredadas sin uso en México: sin acceso desde el portal ni el admin (26/11/2026).
--
-- Vienen del proyecto original (caja, liquidaciones, lotes de acreditación, padrones de
-- impuestos, Payway…). Ningún código de los dos repos las lee ni las escribe y ninguna vista las
-- usa. Ya estaban cerradas por RLS (1066); además se les quitan los permisos a `anon` y
-- `authenticated`, así un error de política futuro no las expone. No se borran (las migraciones
-- son aditivas) y las funciones SECURITY DEFINER heredadas siguen funcionando como antes.
-- Para revertir una: grant select, insert, update, delete on public.<tabla> to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'acreditacion_lotes', 'adelantos', 'caja_molipay', 'caja_movimientos',
    'comercio_banderas_cuotas', 'comercio_establecimientos', 'conciliaciones_archivos',
    'dc_excepciones', 'dc_sync_retroactivo', 'deudas_comercio', 'ib_normalizacion_preview',
    'ib_padrones', 'liquidaciones_importaciones', 'liquidaciones_renglones', 'lote_movimientos',
    'lotes_acreditacion', 'pagos_intentos_payway', 'resolvers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format(
        'comment on table public.%I is %L', t,
        'Heredada del proyecto original, sin uso en México. Sin acceso para anon/authenticated (1070).'
      );
    end if;
  end loop;
end $$;
