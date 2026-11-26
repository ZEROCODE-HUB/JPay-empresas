-- Columnas que el cliente no puede cambiar desde el portal (26/11/2026).
--
-- La RLS deja al cliente actualizar su fila de `clientes` y sus `subaccounts` (el portal edita el
-- perfil y las subcuentas), pero la RLS no distingue columnas: un cliente podía ponerse
-- `estado = 'activado'` (aprobarse solo), subirse los límites, cambiar su correo o legajo, o
-- pasar una subcuenta con pesos a `moneda = 'USD'` y enviar dólares contra ese saldo.
-- Los triggers restauran lo que el cliente no debe tocar. Solo actúan con el rol
-- `authenticated` sin ser administrador: las Edge Functions (service_role) y las funciones
-- SECURITY DEFINER siguen pudiendo cambiar todo. SECURITY INVOKER a propósito (`current_user`).
-- Aditiva.

create or replace function public.tg_clientes_proteger()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  -- Contacto y domicilio: siempre editables. Todo lo demás vuelve a su valor salvo la identidad,
  -- que se puede completar mientras la cuenta no está activa.
  if old.estado in ('activado', 'activo', 'aprobado', 'deshabilitado', 'rechazado') then
    new.nombre := old.nombre;
    new.nombre_legal := old.nombre_legal;
    new.nombre_fantasia := old.nombre_fantasia;
    new.tax_id := old.tax_id;
    new.tax_id_tipo := old.tax_id_tipo;
    new.id_personal := old.id_personal;
    new.id_personal_tipo := old.id_personal_tipo;
    new.cuit := old.cuit;
    new.cuit_cuil := old.cuit_cuil;
    new.tipo_persona := old.tipo_persona;
    new.tipo_sociedad := old.tipo_sociedad;
    new.fecha_inscripcion := old.fecha_inscripcion;
    new.fecha_nacimiento := old.fecha_nacimiento;
    new.genero := old.genero;
    new.es_pep := old.es_pep;
    new.regimen_fiscal := old.regimen_fiscal;
    new.pais_constitucion := old.pais_constitucion;
    new.pais_operacion := old.pais_operacion;
  end if;

  new.id := old.id;
  new.legajo := old.legajo;
  new.correo := old.correo;
  new.estado := old.estado;
  new.estado_onboarding := old.estado_onboarding;
  new.email_verificado := old.email_verificado;
  new.onboarding_completo := old.onboarding_completo;
  new.fecha_alta := old.fecha_alta;
  new.created_at := old.created_at;
  new.pais := old.pais;
  new.cbu := old.cbu;
  new.alias := old.alias;
  new.cbu_cancelado := old.cbu_cancelado;
  new.cuenta_bancaria := old.cuenta_bancaria;
  new.cuenta_bancaria_tipo := old.cuenta_bancaria_tipo;
  new.limite_transferencia := old.limite_transferencia;
  new.limite_ops_diarias := old.limite_ops_diarias;
  new.limite_monto_diario := old.limite_monto_diario;
  return new;
end;
$$;

drop trigger if exists a_clientes_proteger on public.clientes;
-- Prefijo "a_" para que corra antes que los demás triggers BEFORE (van por orden alfabético).
create trigger a_clientes_proteger
  before update on public.clientes
  for each row execute function public.tg_clientes_proteger();

create or replace function public.tg_subaccounts_proteger()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    -- La subcuenta en dólares la crea el servidor al convertir; la CLABE, al asignarla.
    new.moneda := null;
    new.cbu := null;
    new.validada := false;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.subaccount_balances b
       where b.subaccount_id = old.id
         and (coalesce(b.saldo_disponible, 0) <> 0 or coalesce(b.saldo_retenido, 0) <> 0)
    ) then
      raise exception 'No se puede eliminar una subcuenta con saldo' using errcode = '42501';
    end if;
    return old;
  end if;

  new.id := old.id;
  new.cliente_legajo := old.cliente_legajo;
  new.moneda := old.moneda;
  new.cbu := old.cbu;
  new.validada := old.validada;
  new.ingresos := old.ingresos;
  new.egresos := old.egresos;
  new.configuracion := old.configuracion;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists a_subaccounts_proteger on public.subaccounts;
create trigger a_subaccounts_proteger
  before insert or update or delete on public.subaccounts
  for each row execute function public.tg_subaccounts_proteger();
