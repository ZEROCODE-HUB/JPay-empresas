# Operación de JPay: conexiones, correo, funciones y seguridad

Guía práctica de cómo está armada la plataforma por dentro y qué revisar cuando algo no anda.
Vale para los dos repos (`JPay-empresas` = portal de clientes, `JPay-admin` = panel). La
arquitectura del código está en `ARCHITECTURE.md`; lo que falta para producción, en `PENDIENTES.md`.

Última revisión: 26/11/2026.

## 1. Mapa rápido

| Pieza                                        | Dónde vive                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Portal de clientes                           | repo `JPay-empresas` (Vercel publica `main`)                                                      |
| Panel de administración                      | repo `JPay-admin` (Vercel publica `main`)                                                         |
| Base, Auth, Vault, Storage                   | Supabase, proyecto `ovbozgezuboftcjwxlwj`                                                         |
| Migraciones SQL                              | `JPay-empresas/supabase/migrations/` (numeradas; solo aditivas)                                   |
| Edge Functions                               | `JPay-empresas/supabase/functions/` (casi todas) y `JPay-admin/supabase/functions/` (7 del panel) |
| Cuenta SPEI, transferencias, dólares         | proveedor **Cobre** (funciones `cobre-*`)                                                         |
| Cobros con tarjeta, OXXO, suscripciones, POS | proveedor **Ecart Pay** (funciones `ecartpay-*`)                                                  |
| Correo saliente                              | **Resend** (`_shared/email.ts`)                                                                   |

Regla de producto: **el cliente nunca ve los nombres de los proveedores**. En el portal se dice
«Cuenta SPEI», «Cobros con tarjeta» y «procesador de pagos». En el admin sí se nombran.

## 2. Clientes, comercios y conexiones

- **Cliente** (`clientes`, identificado por su `legajo`): la persona o empresa que tiene cuenta.
- **Comercio** (`comercios`): el «negocio» del cliente con el que cobra con tarjeta. Se crea solo
  cuando el cliente se activa o se aprueba su verificación (migraciones 1063 y 1064). Un cliente
  normalmente tiene uno; un admin puede crearle más desde Comercios.
- **Cuenta SPEI (Cobre): una por cliente**, no por comercio. Modelo mixto:
  - _Cuenta Cobre propia_: el cliente ya tiene cuenta en Cobre y el admin la conecta con su User ID
    y su clave de API (un paso: valida, guarda en Vault, vincula su Balance/CLABE y suscribe avisos).
  - _Subcliente de la plataforma_: el admin envía sus datos KYB a Cobre y, al aprobarse, se le crea
    su Balance con CLABE.
- **Cobros con tarjeta (Ecart Pay): una conexión por comercio** (`comercio_proveedores`), por
  OAuth. Si un cliente tiene dos comercios, cada uno se vincula con su propia cuenta de Ecart Pay.

### Quién vincula

| Qué                | Cliente (portal › Conexiones)                                    | Admin (ficha del cliente › Conexiones)                                                    |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Cuenta SPEI        | Ve el estado y **pide la activación**                            | Conecta su cuenta Cobre o lo da de alta como Subcliente                                   |
| Cobros con tarjeta | **Vincula su cuenta de cobros** (OAuth) o **contacta a soporte** | Vincula por OAuth (inicia sesión en Ecart Pay con la cuenta de ese comercio) o desvincula |

El cliente no carga claves de ningún proveedor. `cobre-instancias` solo acepta administradores.

### Varios comercios (limitación conocida)

Conexiones (portal y admin) maneja cada comercio por separado. Pero las pantallas del portal que
operan los cobros (Cobros con tarjeta, Suscripciones, Puntos físicos, Retiros) trabajan con **el
primer comercio** del cliente (`RequiereEcartPay`). Hoy cada cliente tiene un solo comercio; si se
van a usar varios, hay que agregar el selector de comercio en esas pantallas (ver `PENDIENTES.md`).

## 3. Solicitudes de activación y soporte

1. El cliente toca «Solicitar activación» / «Contactar a soporte para activación» y confirma un
   formulario corto, prellenado con sus datos.
2. La Edge Function `solicitar-contacto` guarda la solicitud (RPC `solicitar_contacto`, tabla
   `solicitudes_contacto`; servicios `cobros_tarjeta`, `cuenta_spei`, `domiciliacion`, `soporte`).
   Si ya tenía una abierta del mismo servicio, la actualiza en vez de duplicarla.
3. Aparece en el admin: **Clientes › Solicitudes de contacto**, con acceso directo a la pestaña
   Conexiones del cliente.
4. Además se avisa por correo al buzón de soporte (si el correo está configurado; como mucho un
   aviso cada 10 minutos por solicitud). Si el correo falla, la solicitud igual queda en el admin.

## 4. Correo (Resend)

Correos que manda la plataforma: verificación del correo al registrarse, código de confirmación de
transferencias, recuperación de contraseña y aviso al equipo por cada solicitud de un cliente.

**Cómo activarlo** (una sola vez):

1. En el admin: **Sistema › Integraciones › Correo (Resend)** → pegar la clave de API de Resend →
   Guardar. Se valida contra Resend y se guarda cifrada en Vault (no vuelve al navegador).
2. _Remitente_: tiene que ser de un **dominio verificado en Resend**. Si la cuenta ya tiene uno, se
   completa solo. Sin dominio verificado se usa `onboarding@resend.dev`, que solo le escribe al
   correo dueño de la cuenta de Resend (sirve para probar, no para clientes).
3. _Correo que recibe las solicitudes_: el buzón del equipo de soporte.
4. «Enviar prueba» comprueba todo.

Alternativa por secretos de las funciones (tienen prioridad sobre el panel): `RESEND_API_KEY`,
`RESEND_FROM`, `SOPORTE_EMAIL`. Otros: `APP_URL` (dirección del portal, para los enlaces).

**Modo demo** (sin clave): no se envía nada. El registro y el código de transferencia devuelven el
enlace/código en la respuesta y el portal lo muestra en pantalla; la recuperación de contraseña cae
al correo propio de Supabase Auth. **En producción tiene que haber clave**: en modo demo la
verificación de correo no protege nada.

Código: `supabase/functions/_shared/email.ts` (`configCorreo`, `sendEmail`, plantillas),
`correo-config` (panel), tabla `correo_config` y funciones `correo_*` (migración 1065),
`correo_envios` (tope de reenvíos, 1067).

## 5. Edge Functions

### Públicas y con sesión

Supabase exige un JWT para llamar a una función, salvo que se declare `verify_jwt = false`. Estas
ocho son **públicas a propósito** (están en `supabase/config.toml`):

| Función                                       | Quién la llama                      | Cómo se protege                                            |
| --------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `cobre-webhook`                               | Cobre (avisos)                      | Firma HMAC del aviso                                       |
| `ecartpay-webhook`                            | Ecart Pay (avisos)                  | Firma; el aviso solo dispara una consulta                  |
| `ecartpay-oauth-callback`                     | El navegador al volver de autorizar | `state` de un solo uso                                     |
| `cobre-pendientes`, `ecartpay-pendientes`     | pg_cron cada 5 min                  | `reservar_tarea`; sin parámetros                           |
| `cobre-conciliacion`, `ecartpay-conciliacion` | pg_cron diario                      | `reservar_tarea`; lo manual, solo admin                    |
| `cobre-simulador`                             | pg_cron cada minuto                 | Solo actúa con `COBRE_MODO=simulado`; acciones, solo admin |

El resto exige sesión y valida por dentro quién llama (`esAdmin`, `exigirPermiso`, o el cliente de
la sesión y que el recurso sea suyo). **Toda función que use el service role debe validar a quien
llama**: la clave pública (anon) también pasa `verify_jwt`.

> **Incidente (18–26/11/2026).** Siete de las públicas se redesplegaron sin `--no-verify-jwt` y
> Supabase les activó el JWT: respondían 401 antes de ejecutar. Durante esos días no entraron
> avisos de Cobre, no corrieron las tareas de pendientes ni las conciliaciones y no funcionaba la
> vuelta del OAuth de cobros con tarjeta, sin ningún error visible. Se corrigió y se agregó
> `supabase/config.toml` para que no vuelva a pasar.

### Desplegar y verificar

```bash
# Desplegar una función (config.toml decide si es pública)
SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy <nombre> --project-ref ovbozgezuboftcjwxlwj --use-api

# Comprobar que cada función tiene el acceso que le corresponde (no necesita token)
npm run functions:check

# Tipos antes de desplegar
npx deno@2.9.5 check --node-modules-dir=none supabase/functions/*/index.ts
```

Si una función cambia un archivo de `_shared/`, hay que redesplegar las que lo importan.

### Tareas programadas

`select jobname, schedule from cron.job;` las lista. Su resultado se ve en `net._http_response`
(últimas horas) y en `tareas_programadas` (última corrida). Si aparecen 401 «Missing authorization
header», es el problema de `verify_jwt` de arriba.

## 6. Cobre: lo aprendido contra la API real

México no tiene sandbox: se prueba en un espacio productivo con montos chicos. Diferencias con el
simulador que ya están corregidas:

- `GET /accounts` y `/accounts/{id}` devuelven la CLABE enmascarada salvo con `sensitive_data=true`.
- `GET /accounts/{id}/transactions`: las páginas empiezan en **0** y `date_gte` va como **fecha
  sola** (`2026-11-23`); con hora responde 409 `ACC000`, y pedir una página que no existe, 409 `G003`.
- La conciliación diaria (`cobre-conciliacion`) recupera los depósitos que no entraron por aviso y
  compara el saldo de Cobre con el del ledger.

### Barrido de comisiones (1073)

- El monto lo decide siempre `cobre_barrido_reservar` (SQL, candado por comercio): comisión + IVA
  vigentes (`_cobre_comisiones_cobradas`) − barridos no fallidos. Neto: un rebote posterior al
  barrido se compensa (en la matriz, si queda negativo, se devuelve al comercio).
- `_shared/cobre-barridos.ts` envía (`POST /money_movements`, idempotencia = `external_id` `BAR…`) y
  aplica el estado. Ganchos: confirmación de envíos MXN y de conversiones (modo `por_envio`),
  avisos (`cobre-procesos`), `cobre-pendientes` (reintentos y barrido diario, tarea
  `cobre-barrido-diario` cada 20 h desde `barrido_hora` en México) y `cobre-cuentas` acción `barrer`.
- `cobre_saldo_esperado_comercio` descuenta lo barrido; la conciliación reconoce los movimientos
  `BAR…`. No genera asientos: el pasivo con el comercio no cambia.

## 7. Seguridad

Reglas:

- **RLS en todas las tablas**; ninguna política `using (true)` salvo catálogos de solo lectura.
  Cada cliente ve solo lo suyo (`current_cliente_legajo()`), el backoffice según su rol
  (`is_admin()`, `es_backoffice()`, `rls_tiene_permiso()`).
- **Funciones SQL `SECURITY DEFINER`**: control al inicio (`exigir_*`) y `search_path` fijo; sin
  `EXECUTE` para `anon` salvo las del checkout público (`obtener_link_pago`, `incrementar_vistas_link`).
- **Secretos** de proveedores y de correo: en Vault o en secretos de las funciones, nunca en tablas
  legibles ni en el navegador.
- **Documentos KYC**: bucket privado `kyc`, carpeta por legajo; se sirven con enlaces firmados
  (`doc-url` en el portal, `get-document-url` en el admin). Quién es administrador se decide por rol
  en la base, nunca por el dominio del correo.
- **Ledger**: los asientos no se editan ni se borran; las correcciones son contra-asientos.
- **La RLS no protege columnas**: si un cliente puede actualizar una fila, puede cambiar cualquier
  columna. Las columnas que no debe tocar se restauran con un trigger `SECURITY INVOKER` que mira
  `current_user` (`tg_clientes_proteger`, `tg_subaccounts_proteger`, `tg_links_pago_proteger`).
  Al agregar una columna sensible a una tabla que el cliente edita, sumarla al trigger.
- **Dinero y códigos los genera el servidor**: links de pago (`crear_link_pago`), lotes de cobro
  (`crear_lote_con_registros`, `iniciar_lote`), TXID verificados, OTP (`otp_consumir`).
- **Antes de mover dinero, confirmación** con destinatario, monto y comisión (`ConfirmarEnvio`).

Auditoría del 26/11/2026 (reproducida simulando roles sobre la base real y verificada después):

| Hueco                                                                                                             | Corrección                                                         |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `crear-cliente` aceptaba el correo del body: cualquiera podía reescribir RFC, CLABE y documentos de otro cliente  | El correo sale de la sesión; una cuenta activada no se reescribe   |
| `doc-url` trataba como admin a cualquier correo del dominio de la marca                                           | Rol en la base (`es_backoffice`)                                   |
| Un cliente podía listar y descargar documentos KYC de otros (política del bucket)                                 | Migración 1066: cada quien su carpeta                              |
| Un anónimo leía `caja_molipay` y `v_lotes_venta` y podía modificar `tipos_movimiento` y otras tablas heredadas    | Migración 1066                                                     |
| Un cliente leía el historial de estados de transacciones ajenas                                                   | Migración 1066                                                     |
| Bucket `conciliaciones` abierto a cualquier usuario con sesión                                                    | Migración 1066: solo backoffice                                    |
| `reenviar-verificacion` sin tope                                                                                  | 3 cada 10 minutos; no reenvía a cuentas verificadas                |
| El checkout buscaba el link con `url like '%código'`: un cliente podía crear un link que terminara igual que otro | 1069: código aleatorio único del servidor, búsqueda exacta         |
| Un cliente podía cambiar su `estado` (aprobarse), sus límites o la moneda de una subcuenta con saldo              | 1071: triggers que restauran esas columnas                         |
| Un cliente podía apuntar una fila de `documentos` al archivo KYC de otro y pedir el enlace firmado                | 1072 (solo backoffice escribe) y `doc-url` exige la carpeta propia |
| Un aviso de domiciliación con el id de otra orden pagada se registraba como cobro                                 | La orden debe ser del mismo cliente de Ecart Pay y del mismo monto |
| Registro y reenvío decían si un correo tenía cuenta                                                               | Misma respuesta siempre; aviso por correo al dueño (con tope)      |
| Exportación CSV: un texto con `=` al inicio era una fórmula en Excel                                              | Se antepone un apóstrofo                                           |

Arreglos anteriores: migraciones 1017, 1018, 1055 (controles en funciones) y 1063 (`comercios`).

### Cómo repetir la auditoría

```sql
-- Tablas sin RLS
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Políticas «todo para todos»
select tablename, policyname, cmd, roles from pg_policies
 where schemaname = 'public' and (qual = 'true' or with_check = 'true');

-- Vistas que saltan RLS y son legibles desde el navegador
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v'
   and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') <> 'true'
   and (has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('authenticated', c.oid, 'select'));

-- Simular a un cliente (siempre con rollback)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","email":"<correo>","role":"authenticated"}';
select count(*) from public.transactions;  -- solo las suyas
rollback;
```

## 8. Antes de publicar un cambio

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run brand:check && npm run shared:check
npm run functions:check        # solo en JPay-empresas
```
