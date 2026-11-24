-- Historial del portal: una operación anulada (ledger_status «reversed»: su asiento y su reverso
-- se compensan) no entra en ingresos ni egresos; se cuenta aparte en «tx_anuladas», como las
-- rechazadas. Antes inflaba ingresos y egresos con el monto y su reverso (el neto sí daba).

CREATE OR REPLACE FUNCTION public.portal_totales_historial(p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone, p_tipos text[] DEFAULT NULL::text[], p_tipo_linea text DEFAULT NULL::text, p_subaccount_id uuid DEFAULT NULL::uuid, p_clabe text DEFAULT NULL::text, p_rfc text DEFAULT NULL::text, p_txid text DEFAULT NULL::text, p_titular text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_legajo text := public.current_cliente_legajo();
  r jsonb;
begin
  if v_legajo is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;
  with l as (
    select v.transaction_id, v.monto, v.moneda, v.tipo_linea, v.estado_codigo, v.ledger_status
      from public.v_transaction_lines v
     where v.legajo = v_legajo
       and (p_desde is null or v.fecha >= p_desde)
       and (p_hasta is null or v.fecha <= p_hasta)
       and (p_tipos is null or v.tipo_operacion = any (p_tipos))
       and (p_tipo_linea is null or v.tipo_linea = p_tipo_linea)
       and (p_subaccount_id is null or v.subaccount_id = p_subaccount_id)
       and (coalesce(btrim(p_clabe), '') = ''
            or v.cvu ilike '%' || btrim(p_clabe) || '%' or v.cvu_propio ilike '%' || btrim(p_clabe) || '%')
       and (coalesce(btrim(p_txid), '') = '' or v.id_txn ilike '%' || btrim(p_txid) || '%')
       and (coalesce(btrim(p_titular), '') = '' or v.nombre_destino ilike '%' || btrim(p_titular) || '%')
       and (coalesce(p_rfc, '') = ''
            or v.cuit ilike '%' || regexp_replace(p_rfc, '[\s-]', '', 'g') || '%')
  ),
  efectivas as (
    select * from l
     where tipo_linea <> 'pendiente' and coalesce(estado_codigo, '') <> 'RECHAZADO'
       and coalesce(ledger_status, '') <> 'reversed'
  )
  select jsonb_build_object(
    'lineas', (select count(*) from l),
    'monedas', coalesce((
      select jsonb_object_agg(moneda, jsonb_build_object(
        'ingresos', ingresos, 'egresos', egresos, 'neto', ingresos - egresos,
        'lineas_ingreso', li, 'lineas_egreso', le))
        from (select moneda,
                     coalesce(sum(monto) filter (where monto > 0), 0) ingresos,
                     coalesce(-sum(monto) filter (where monto < 0), 0) egresos,
                     count(*) filter (where monto > 0) li,
                     count(*) filter (where monto < 0) le
                from efectivas group by moneda) x), '{}'::jsonb),
    'tx_pendientes', (select count(distinct transaction_id) from l
                       where tipo_linea = 'pendiente'
                          or estado_codigo in ('PENDIENTE', 'EN_PROGRESO', 'CREADO', 'ABIERTO')),
    'tx_rechazadas', (select count(distinct transaction_id) from l where estado_codigo = 'RECHAZADO'),
    'tx_anuladas', (select count(distinct transaction_id) from l
                     where ledger_status = 'reversed' and coalesce(estado_codigo, '') <> 'RECHAZADO')
  ) into r;
  return r;
end;
$function$;
