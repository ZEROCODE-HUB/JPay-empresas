-- Avisos por correo al cliente en los eventos importantes (26/11/2026). Aditiva.
--
-- Bandeja de salida: un trigger en cada tabla deja una fila en `avisos_correo` cuando pasa algo
-- que el cliente quiere saber, venga de donde venga (aviso del proveedor, revisión de pendientes,
-- conciliación o simulador). La Edge Function `avisos-correo` (pg_cron cada minuto) las manda.
-- Cada evento se avisa una sola vez: único (evento, referencia).
--
-- Eventos:
--   deposito_recibido        depósito SPEI acreditado en una subcuenta
--   cobro_recibido           cobro pagado (link de pago, tarjeta, OXXO, SPEI con referencia)
--   cobro_spei_recibido      cobro por SPEI con CLABE única pagado (sin pago asociado)
--   envio_completado         transferencia SPEI o en dólares completada (no los ítems de lote)
--   envio_fallido            transferencia rechazada, fallida o devuelta (no los ítems de lote)
--   lote_completado          lote de transferencias terminado
--   lote_fallido             lote cancelado o fallido
--   contracargo_recibido     contracargo nuevo de un cobro con tarjeta
--   cuenta_aprobada          alta de la cuenta aprobada por el banco

create table if not exists public.avisos_correo (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes (legajo) on delete cascade,
  evento text not null check (evento in (
    'deposito_recibido', 'cobro_recibido', 'cobro_spei_recibido', 'envio_completado',
    'envio_fallido', 'lote_completado', 'lote_fallido', 'contracargo_recibido', 'cuenta_aprobada')),
  referencia text not null,
  datos jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviando', 'enviado', 'sin_correo', 'error', 'vencido')),
  intentos int not null default 0,
  error text,
  destinatario text,
  tomado_at timestamptz,
  created_at timestamptz not null default now(),
  enviado_at timestamptz,
  unique (evento, referencia)
);
create index if not exists avisos_correo_pendientes on public.avisos_correo (created_at)
  where estado in ('pendiente', 'enviando', 'error');

alter table public.avisos_correo enable row level security;
revoke all on public.avisos_correo from anon, authenticated;
grant select on public.avisos_correo to authenticated;
drop policy if exists avisos_correo_select on public.avisos_correo;
create policy avisos_correo_select on public.avisos_correo for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());

-- Encola un aviso (ignora el repetido).
create or replace function public._aviso_correo(
  p_legajo text, p_evento text, p_referencia text, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_legajo is null or p_referencia is null then
    return;
  end if;
  insert into public.avisos_correo (cliente_legajo, evento, referencia, datos)
  values (p_legajo, p_evento, p_referencia, coalesce(p_datos, '{}'::jsonb))
  on conflict (evento, referencia) do nothing;
end;
$$;
revoke all on function public._aviso_correo(text, text, text, jsonb) from public, anon, authenticated;

-- Cambió el estado a `p_estado` (o la fila nació en ese estado).
create or replace function public._aviso_entro(p_tg_op text, p_viejo text, p_nuevo text, p_estados text[])
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_nuevo = any (p_estados)
     and (p_tg_op = 'INSERT' or p_viejo is distinct from p_nuevo);
$$;

-- Depósitos SPEI
create or replace function public._aviso_deposito()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if public._aviso_entro(tg_op, case when tg_op = 'UPDATE' then old.estado end, new.estado, array['acreditado']) then
    perform public._aviso_correo(new.cliente_legajo, 'deposito_recibido', new.id::text, jsonb_build_object(
      'monto', new.monto, 'moneda', 'MXN', 'remitente', new.remitente,
      'remitente_cuenta', new.remitente_cuenta, 'clave_rastreo', new.clave_rastreo,
      'cep', new.cep, 'fecha', coalesce(new.fecha_operacion::text, new.recibido_at::text)));
  end if;
  return new;
end;
$$;
drop trigger if exists aviso_correo on public.cobre_depositos;
create trigger aviso_correo after insert or update of estado on public.cobre_depositos
  for each row execute function public._aviso_deposito();

-- Cobros (links de pago, tarjeta, OXXO, SPEI con referencia)
create or replace function public._aviso_pago()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if public._aviso_entro(tg_op, case when tg_op = 'UPDATE' then old.estado end, new.estado, array['pagado']) then
    perform public._aviso_correo(new.cliente_legajo, 'cobro_recibido', new.id::text, jsonb_build_object(
      'monto', new.monto, 'moneda', coalesce(new.moneda, 'MXN'), 'metodo', new.metodo,
      'pagador', new.pagador_nombre, 'pagador_email', new.pagador_email,
      'referencia', new.referencia, 'fecha', coalesce(new.pagado_at, now())::text));
  end if;
  return new;
end;
$$;
drop trigger if exists aviso_correo on public.pagos;
create trigger aviso_correo after insert or update of estado on public.pagos
  for each row execute function public._aviso_pago();

-- Cobros por SPEI con CLABE única (los que tienen pago asociado ya avisan por `pagos`)
create or replace function public._aviso_cobro_r2p()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.pago_id is null
     and public._aviso_entro(tg_op, case when tg_op = 'UPDATE' then old.estado end, new.estado, array['pagado']) then
    perform public._aviso_correo(new.cliente_legajo, 'cobro_spei_recibido', new.id::text, jsonb_build_object(
      'monto', new.monto, 'moneda', 'MXN', 'concepto', new.concepto,
      'pagador', new.pagador_nombre, 'fecha', coalesce(new.pagado_at, now())::text));
  end if;
  return new;
end;
$$;
drop trigger if exists aviso_correo on public.cobre_cobros_r2p;
create trigger aviso_correo after insert or update of estado on public.cobre_cobros_r2p
  for each row execute function public._aviso_cobro_r2p();

-- Transferencias (los ítems de un lote se avisan con el lote)
create or replace function public._aviso_transferencia()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_viejo text := case when tg_op = 'UPDATE' then old.estado end;
  v_evento text;
  v_cp record;
begin
  if new.lote_id is not null then
    return new;
  end if;
  if public._aviso_entro(tg_op, v_viejo, new.estado, array['completada']) then
    v_evento := 'envio_completado';
  elsif public._aviso_entro(tg_op, v_viejo, new.estado, array['rechazada', 'fallida', 'devuelta']) then
    v_evento := 'envio_fallido';
  else
    return new;
  end if;
  select titular, numero, banco into v_cp from public.cobre_contrapartes where id = new.contraparte_id;
  perform public._aviso_correo(new.cliente_legajo, v_evento, new.id::text || ':' || new.estado, jsonb_build_object(
    'monto', new.monto, 'moneda', coalesce(new.moneda, 'MXN'), 'tipo', new.tipo,
    'estado', new.estado, 'titular', v_cp.titular, 'numero', v_cp.numero, 'banco', v_cp.banco,
    'concepto', new.concepto, 'clave_rastreo', new.clave_rastreo, 'cep', new.cep,
    'uetr', new.swift_uetr, 'motivo', new.motivo, 'id_txn', new.id_txn));
  return new;
end;
$$;
drop trigger if exists aviso_correo on public.cobre_transferencias;
create trigger aviso_correo after insert or update of estado on public.cobre_transferencias
  for each row execute function public._aviso_transferencia();

-- Lotes
create or replace function public._aviso_lote()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_viejo text := case when tg_op = 'UPDATE' then old.estado end;
  v_evento text;
  v_ok int;
  v_mal int;
begin
  if public._aviso_entro(tg_op, v_viejo, new.estado, array['completed']) then
    v_evento := 'lote_completado';
  elsif public._aviso_entro(tg_op, v_viejo, new.estado, array['canceled', 'failed']) then
    v_evento := 'lote_fallido';
  else
    return new;
  end if;
  select count(*) filter (where estado = 'completada'),
         count(*) filter (where estado in ('rechazada', 'fallida', 'devuelta', 'cancelada', 'error_envio'))
    into v_ok, v_mal
    from public.cobre_transferencias where lote_id = new.id;
  perform public._aviso_correo(new.cliente_legajo, v_evento, new.id::text, jsonb_build_object(
    'archivo', new.archivo, 'cantidad', new.cantidad, 'total', new.total, 'moneda', 'MXN',
    'completadas', v_ok, 'fallidas', v_mal, 'motivo', new.motivo));
  return new;
end;
$$;
drop trigger if exists aviso_correo on public.cobre_lotes;
create trigger aviso_correo after insert or update of estado on public.cobre_lotes
  for each row execute function public._aviso_lote();

-- Contracargos de cobros con tarjeta
create or replace function public._aviso_contracargo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public._aviso_correo(new.cliente_legajo, 'contracargo_recibido', new.id::text, jsonb_build_object(
    'monto', new.monto, 'moneda', coalesce(new.moneda, 'MXN'), 'motivo', new.motivo,
    'vence', new.vence_at::text));
  return new;
end;
$$;
drop trigger if exists aviso_correo on public.contracargos_proveedor;
create trigger aviso_correo after insert on public.contracargos_proveedor
  for each row execute function public._aviso_contracargo();

-- Alta de la cuenta aprobada
create or replace function public._aviso_subcliente()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if public._aviso_entro(tg_op, case when tg_op = 'UPDATE' then old.estado end, new.estado, array['approved']) then
    perform public._aviso_correo(new.cliente_legajo, 'cuenta_aprobada', new.cliente_legajo, '{}'::jsonb);
  end if;
  return new;
end;
$$;
drop trigger if exists aviso_correo on public.cobre_subclientes;
create trigger aviso_correo after insert or update of estado on public.cobre_subclientes
  for each row execute function public._aviso_subcliente();

-- Toma hasta `p_limite` avisos para mandar (los deja en `enviando`; uno trabado más de 10 min se
-- vuelve a tomar). Los de más de 2 días sin mandar se dan por vencidos: no tiene sentido avisar
-- tarde, ni mandar de golpe los acumulados mientras el correo estuvo sin configurar.
create or replace function public.avisos_correo_tomar(p_limite int default 50)
returns setof public.avisos_correo
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.avisos_correo set estado = 'vencido'
   where estado in ('pendiente', 'enviando', 'error') and created_at < now() - interval '2 days';
  return query
  update public.avisos_correo a set estado = 'enviando', intentos = a.intentos + 1, tomado_at = now()
   where a.id in (
     select id from public.avisos_correo
      where (estado = 'pendiente'
             or (estado = 'error' and intentos < 5)
             or (estado = 'enviando' and tomado_at < now() - interval '10 minutes'))
      order by created_at
      limit greatest(1, least(p_limite, 200))
      for update skip locked)
  returning a.*;
end;
$$;
revoke all on function public.avisos_correo_tomar(int) from public, anon, authenticated;
grant execute on function public.avisos_correo_tomar(int) to service_role;
