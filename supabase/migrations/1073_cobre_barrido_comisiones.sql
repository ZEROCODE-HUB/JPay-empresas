-- Barrido de comisiones de Cobre a JPay (26/11/2026).
--
-- La comisión + IVA de cada envío o conversión se contabiliza como ingreso de JPay
-- (INGRESOS_COMISIONES_MXN / IVA_DEBITO_FISCAL_MXN), pero el dinero se queda en el Cobre Balance
-- del comercio. El barrido lo mueve:
--  * comercio en la cuenta de JPay (Subcliente, sin instancia): movimiento interno del Balance del
--    comercio al Balance de comisiones de JPay (`cobre_configuracion.cuenta_plataforma_id`);
--  * comercio con instancia Cobre propia: SPEI desde su Balance a la CLABE de JPay configurada en
--    el admin (`barrido_clabe`), solo si `barrido_instancias` está prendido.
-- Lo que hay que barrer se calcula siempre por saldo neto (comisiones cobradas que siguen en el
-- Balance − barridos no fallidos), así un rebote posterior al barrido lo compensa el siguiente
-- (en la matriz, si queda negativo, se devuelve al comercio). Modos: `desactivado`, `por_envio`
-- (al confirmarse cada envío/conversión + revisión diaria de reintento) o `diario`.
-- No genera asientos: el pasivo con el comercio no cambia (la comisión ya se le descontó); solo
-- cambia en qué Balance está el dinero. Aditiva.

alter table public.cobre_configuracion
  add column if not exists barrido_modo text not null default 'desactivado'
    check (barrido_modo in ('desactivado', 'por_envio', 'diario')),
  add column if not exists barrido_monto_minimo numeric(14, 2) not null default 0
    check (barrido_monto_minimo >= 0),
  -- Hora de México (UTC−6) desde la que corre el barrido diario.
  add column if not exists barrido_hora smallint not null default 9
    check (barrido_hora between 0 and 23),
  add column if not exists barrido_instancias boolean not null default false,
  add column if not exists barrido_clabe text check (barrido_clabe is null or barrido_clabe ~ '^[0-9]{18}$'),
  add column if not exists barrido_titular text,
  add column if not exists barrido_rfc text;

create unique index if not exists cobre_cuentas_plataforma_key
  on public.cobre_cuentas (modo) where tipo = 'plataforma' and estado = 'activa';

create table if not exists public.cobre_barridos (
  id uuid primary key default gen_random_uuid(),
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  cliente_legajo text not null references public.clientes (legajo) on delete restrict,
  instancia_id uuid references public.cobre_instancias (id) on delete restrict,
  via text not null check (via in ('interno', 'spei')),
  -- a_plataforma: comisiones al Balance/CLABE de JPay; a_cliente: devolución (rebote posterior).
  direccion text not null check (direccion in ('a_plataforma', 'a_cliente')),
  monto numeric(14, 2) not null check (monto > 0),
  cuenta_origen text not null,
  destino text not null,
  external_id text not null unique,
  mm_id text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'completado', 'fallido')),
  motivo text,
  origen text not null check (origen in ('envio', 'diario', 'manual')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completado_at timestamptz
);
create index if not exists cobre_barridos_cliente_idx on public.cobre_barridos (cliente_legajo, created_at desc);
create index if not exists cobre_barridos_abiertos_idx on public.cobre_barridos (estado)
  where estado in ('pendiente', 'enviado');

alter table public.cobre_barridos enable row level security;
revoke all on public.cobre_barridos from anon;
revoke insert, update, delete on public.cobre_barridos from authenticated;
grant select on public.cobre_barridos to authenticated;
drop policy if exists cobre_barridos_select on public.cobre_barridos;
create policy cobre_barridos_select on public.cobre_barridos for select to authenticated
  using (public.es_backoffice());

-- Contraparte SPEI de la CLABE de JPay dentro de cada instancia propia (se crea una vez por CLABE).
create table if not exists public.cobre_barrido_contrapartes (
  instancia_id uuid not null references public.cobre_instancias (id) on delete cascade,
  clabe text not null,
  contraparte_externa_id text not null,
  created_at timestamptz not null default now(),
  primary key (instancia_id, clabe)
);
alter table public.cobre_barrido_contrapartes enable row level security;
revoke all on public.cobre_barrido_contrapartes from anon, authenticated;

-- Comisiones + IVA cobradas al comercio en Cobre (MXN) que siguen contabilizadas.
create or replace function public._cobre_comisiones_cobradas(p_legajo text)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select sum(t.comision + t.impuesto)
      from public.transactions t
     where t.legajo = p_legajo and t.ledger_status = 'posted' and t.currency_code = 'MXN'
       and (t.id_txn like 'COBRE-%'
            or t.id_txn in (select ct.id_txn from public.cobre_transferencias ct
                             where ct.cliente_legajo = p_legajo and ct.moneda = 'MXN')
            or t.id_txn in (select cc.external_id from public.cobre_cruces cc
                             where cc.cliente_legajo = p_legajo))
  ), 0);
$$;

-- Neto ya barrido (a_plataforma − a_cliente). p_incluir_en_curso: suma también pendientes/enviados.
create or replace function public._cobre_barrido_neto(p_legajo text, p_incluir_en_curso boolean)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(sum(case when b.direccion = 'a_plataforma' then b.monto else -b.monto end), 0)
    from public.cobre_barridos b
   where b.cliente_legajo = p_legajo
     and (b.estado = 'completado'
          or (p_incluir_en_curso and b.estado in ('pendiente', 'enviado')));
$$;

revoke execute on function public._cobre_comisiones_cobradas(text) from public, anon, authenticated;
revoke execute on function public._cobre_barrido_neto(text, boolean) from public, anon, authenticated;

-- Saldo esperado del Balance del comercio: ahora descuenta lo ya barrido.
create or replace function public.cobre_saldo_esperado_comercio(p_legajo text)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select sum(b.saldo_disponible + b.saldo_retenido)
      from public.subaccounts s join public.subaccount_balances b on b.subaccount_id = s.id
     where s.cliente_legajo = p_legajo and coalesce(s.moneda, 'MXN') = 'MXN'
       and exists (select 1 from public.ledger_accounts la where la.subaccount_id = s.id and la.currency_code = 'MXN')
  ), 0)
  + public._cobre_comisiones_cobradas(p_legajo)
  - public._cobre_barrido_neto(p_legajo, false);
$$;

-- Reserva el barrido de un comercio: calcula el neto pendiente con un candado por comercio (dos
-- confirmaciones a la vez no barren dos veces) y deja la fila `pendiente` lista para enviar.
-- Devuelve la fila o {omitido: motivo}. Solo service_role (lo llaman las Edge Functions).
create or replace function public.cobre_barrido_reservar(
  p_modo text,
  p_legajo text,
  p_origen text,
  p_forzar boolean default false,
  p_usuario uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cfg public.cobre_configuracion;
  v_cuenta record;
  v_plataforma text;
  v_monto numeric;
  v_via text;
  v_destino text;
  v_dir text;
  v_fila public.cobre_barridos;
begin
  perform pg_advisory_xact_lock(hashtext('cobre-barrido:' || p_legajo));
  select * into v_cfg from public.cobre_configuracion where id = 1;
  if v_cfg.barrido_modo = 'desactivado' and not p_forzar then
    return jsonb_build_object('omitido', 'El barrido está desactivado');
  end if;

  select id, cuenta_externa_id, instancia_id into v_cuenta
    from public.cobre_cuentas
   where modo = p_modo and tipo = 'cliente' and cliente_legajo = p_legajo and estado = 'activa'
     and coalesce(moneda, 'MXN') = 'MXN'
   limit 1;
  if not found then
    return jsonb_build_object('omitido', 'El comercio no tiene Cobre Balance activo');
  end if;

  if exists (select 1 from public.cobre_barridos
              where cliente_legajo = p_legajo and estado = 'pendiente') then
    return jsonb_build_object('omitido', 'Ya hay un barrido en curso');
  end if;

  v_monto := round(public._cobre_comisiones_cobradas(p_legajo) - public._cobre_barrido_neto(p_legajo, true), 2);

  if v_cuenta.instancia_id is null then
    select c.cuenta_externa_id into v_plataforma
      from public.cobre_cuentas c
     where c.id = v_cfg.cuenta_plataforma_id and c.modo = p_modo and c.estado = 'activa';
    if v_plataforma is null then
      return jsonb_build_object('omitido', 'Falta el Balance de comisiones de la plataforma');
    end if;
    v_via := 'interno';
    v_destino := v_plataforma;
  else
    if not v_cfg.barrido_instancias and not p_forzar then
      return jsonb_build_object('omitido', 'El barrido de cuentas propias está apagado');
    end if;
    if v_cfg.barrido_clabe is null then
      return jsonb_build_object('omitido', 'Falta la CLABE de comisiones');
    end if;
    if v_monto < 0 then
      return jsonb_build_object('omitido', 'Saldo a favor del comercio: se compensa en el siguiente barrido',
                                'monto', v_monto);
    end if;
    v_via := 'spei';
    v_destino := v_cfg.barrido_clabe;
  end if;

  if abs(v_monto) < 0.01 then
    return jsonb_build_object('omitido', 'Nada por barrer', 'monto', 0);
  end if;
  if v_monto > 0 and v_monto < v_cfg.barrido_monto_minimo and not p_forzar then
    return jsonb_build_object('omitido', 'Por debajo del monto mínimo', 'monto', v_monto);
  end if;
  v_dir := case when v_monto > 0 then 'a_plataforma' else 'a_cliente' end;

  insert into public.cobre_barridos (modo, cliente_legajo, instancia_id, via, direccion, monto,
                                     cuenta_origen, destino, external_id, origen, created_by)
  values (p_modo, p_legajo, v_cuenta.instancia_id, v_via, v_dir, abs(v_monto),
          case when v_dir = 'a_plataforma' then v_cuenta.cuenta_externa_id else v_destino end,
          case when v_dir = 'a_plataforma' then v_destino else v_cuenta.cuenta_externa_id end,
          'BAR' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14)),
          p_origen, p_usuario)
  returning * into v_fila;
  return to_jsonb(v_fila);
end;
$$;

revoke execute on function public.cobre_barrido_reservar(text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.cobre_barrido_reservar(text, text, text, boolean, uuid) to service_role;

-- Resumen para el admin: por comercio con Cobre Balance, lo cobrado, lo barrido y lo pendiente.
drop function if exists public.cobre_barrido_resumen(text);
create or replace function public.cobre_barrido_resumen()
returns table (
  cliente_legajo text,
  nombre text,
  modo text,
  propia boolean,
  cobradas numeric,
  barrido numeric,
  en_curso numeric,
  por_barrer numeric,
  ultimo_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.es_backoffice() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return query
  select c.cliente_legajo,
         coalesce(nullif(cl.nombre_fantasia, ''), cl.nombre, c.cliente_legajo)::text,
         c.modo,
         c.instancia_id is not null,
         public._cobre_comisiones_cobradas(c.cliente_legajo),
         public._cobre_barrido_neto(c.cliente_legajo, false),
         public._cobre_barrido_neto(c.cliente_legajo, true) - public._cobre_barrido_neto(c.cliente_legajo, false),
         public._cobre_comisiones_cobradas(c.cliente_legajo) - public._cobre_barrido_neto(c.cliente_legajo, true),
         (select max(b.created_at) from public.cobre_barridos b where b.cliente_legajo = c.cliente_legajo)
    from public.cobre_cuentas c
    left join public.clientes cl on cl.legajo = c.cliente_legajo
   where c.tipo = 'cliente' and c.estado = 'activa'
     and coalesce(c.moneda, 'MXN') = 'MXN'
   order by 8 desc;
end;
$$;

revoke execute on function public.cobre_barrido_resumen() from public, anon;
grant execute on function public.cobre_barrido_resumen() to authenticated;
