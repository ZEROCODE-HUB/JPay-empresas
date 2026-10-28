# Plan de implementación: Ecart Pay + plataforma neutral por país

Fecha: 2026-10-27 · Alcance: panel admin (JPay-admin) y portal de empresas (JPay-empresas)
Objetivo: lanzar en México con Ecart Pay, 100% funcional en el entorno de pruebas (sandbox),
sin atar la plataforma a un país ni a un proveedor, para poder sumar otros después.

---

## 0. Resumen en una página

---

Hoy la plataforma está hecha para Argentina y para dos proveedores fijos:

- Pagos con tarjeta: Payway (código, columnas de la base y reportes con su nombre).
- Transferencias: Banco de Comercio / Coelsa (CBU, CVU, alias, CUIT).
- Formato, impuestos y regulación argentinos: pesos "$", CUIT, IIBB, débitos y créditos, BCRA, AFIP.

El plan tiene dos partes que avanzan juntas:

A. **Volver la plataforma neutral** (país y proveedor configurables). Es la base para que México
sea "un país más" y no una copia del sistema.
B. **Integrar Ecart Pay** como el primer proveedor de la nueva estructura, en sandbox, cubriendo:
conexión del comercio, cobros online (links, checkout, tarjeta, transferencia SPEI, OXXO),
puntos físicos (sucursales, cajas, terminales), avisos automáticos (webhooks), reembolsos,
contracargos, conciliación y reportes. Todo visible en el portal de empresas y controlado
desde el admin.

Orden propuesto (cada fase se puede probar sola):

| Fase | Qué se logra                                                      | Dónde                       |
| ---- | ----------------------------------------------------------------- | --------------------------- |
| 1    | Configuración por país (México) y por proveedor                   | base + ambos repos          |
| 2    | Conexión segura con Ecart Pay (servidor, credenciales, sandbox)   | Edge Functions + admin      |
| 3    | El comercio conecta su cuenta (OAuth)                             | empresas + admin            |
| 4    | Cobros online: links de pago, checkout, tarjeta, 3DS              | empresas + checkout público |
| 5    | Avisos automáticos (webhooks) y estados de pago                   | Edge Functions + base       |
| 6    | Transferencias SPEI y efectivo OXXO                               | empresas + checkout         |
| 7    | Puntos físicos: sucursales, cajas, terminales y cobro en terminal | empresas + admin            |
| 8    | Reembolsos, contracargos, conciliación y reportes                 | admin + empresas            |
| 9    | Pruebas completas en sandbox y salida a producción                | todos                       |

---

## 1. Decisiones que hay que tomar ANTES de programar

---

Estas definen la arquitectura del dinero. Las marco con (!) en el resto del plan.

**Decididas (2026-10-27):**

- D1 → **Ambos modelos, configurables** (default de la instalación + override por comercio):
  - `directo` (A): el comercio conecta su cuenta Ecart Pay por OAuth y cobra en ella.
  - `centralizado` (B): se cobra con la cuenta Ecart Pay de JPay y se le liquida al comercio
    por Payouts. Requiere revisión regulatoria antes de producción.
  - Arranque recomendado: `directo`.
- D2 → **Solo México** (confirmado). La estructura queda neutral por país; lo argentino
  (Payway/BDC, CUIT, BCRA) se apaga por configuración, no se borra.
- D3 → **Configurable** por comercio y con valor por defecto global: porcentaje y/o monto fijo,
  IVA 16% sobre la comisión. En sandbox solo se calcula y se muestra. Forma de cobro de la
  comisión, también configurable (se soportan todas):
  - `split_proveedor`: Ecart Pay la separa sola en cada cobro. Según el usuario existe, pero la
    activa Ecart Pay por negociación aparte; JPay solo la registra y concilia.
  - `descuento_liquidacion`: en modelo `centralizado`, se descuenta antes del payout.
  - `cobro_aparte`: en modelo `directo` sin split, se acumula y se cobra (payout del comercio a
    JPay si los scopes lo permiten, o factura/cargo mensual).
- D4 → CFDI fuera de esta etapa.
- D5 → Primero terminales físicas Ecart Pay; Tap to Phone y kiosco quedan modelados.
- D6 → Onboarding México: RFC (física/moral), CURP (física), régimen fiscal, CLABE, INE,
  comprobante de domicilio. Campos definidos por país (estructura neutral).
- Trabajo en ramas `feature/ecartpay-*`; no se mergea a `main` sin OK. Cliente demo MX
  `empresa.mx@jpay.example`.

D1. ¿Quién recibe el dinero? (la más importante) - Opción A "cada comercio con su cuenta Ecart Pay": el comercio conecta su cuenta por OAuth,
el dinero de sus ventas cae en SU cuenta Ecart Pay. JPay organiza, muestra y cobra su
comisión aparte (factura o débito). Es lo que la documentación de OAuth propone. - Opción B "cuenta central de JPay": todo se cobra en la cuenta Ecart Pay de JPay y JPay le
paga a cada comercio (con Payouts o transferencias SPEI). JPay es quien custodia fondos:
requiere licencia/regulación en México (IFPE / CNBV) y conciliación más estricta. - Recomendación para arrancar: Opción A (menos riesgo regulatorio, ya soportada por OAuth).
La estructura del plan sirve para ambas.

D2. ¿JPay sigue funcionando en Argentina con Payway/BDC, o México reemplaza a Argentina? - Si conviven: cada comercio/país usa su proveedor (lo que propone este plan). - Si México reemplaza: igual conviene la estructura neutral, pero se puede apagar lo argentino.

D3. Comisión de JPay en México: ¿porcentaje, fijo, ambos? ¿IVA 16% sobre la comisión?
¿Cómo se cobra (Opción A: factura mensual / descuento vía Payouts)?

D4. Facturación electrónica (CFDI): ¿JPay factura su comisión? ¿Los comercios quieren emitir
CFDI a sus clientes desde la plataforma? (Ecart Pay lo ofrece; es opcional).

D5. Puntos físicos: ¿qué terminales se usarán? (terminales Ecart Pay, kiosco PAX SK700,
Tap to Phone en celulares Android). El plan cubre las tres, pero conviene empezar por una.

D6. Identidad del comercio en México: RFC (persona física / moral), CURP, régimen fiscal,
comprobante de domicilio, INE. Reemplaza CUIT/DNI del onboarding argentino.

---

## 2. Preguntas para el soporte de Ecart Pay (lo que la documentación no aclara)

---

Revisión completa de la documentación (2026-10-27, incluidas las páginas que faltaban de
llms.txt). Resultado:

**Resueltas con la documentación**

- Header: la referencia de la API manda el token sin prefijo (`Authorization: <token>`, cientos
  de ejemplos); solo las guías de POS, suscripciones y creación de apps OAuth usan `Bearer`.
  El adaptador manda sin prefijo y reintenta con `Bearer` ante 401; se fija por endpoint al probar.
- Estados de orden: `created`, `pending`, `paid`, `cancelled` (incluye referencias OXXO vencidas
  a los 5 días), `refunded`, `partially_refunded`. Contracargos: `created`, `pending`,
  `in_review`, `won`, `lost` (docs_webhook-events).
- Global Secret de webhooks: se copia en el panel (Webhooks) al crear el webhook; los webhooks
  también se crean por API. Firma: HMAC-SHA256 de `{timestamp}.{webhook_id}.{JSON(data)}`,
  header `x-pay-signature: SHA256=...`.
- OAuth en sandbox: existe (`https://sandbox.ecartpay.com`). Los scopes viajan dentro del token y
  se pueden pedir más (ej. `read_customers`); la lista completa sale de `GET` scopes de la API.
- Split / marketplace: no hay split automático. El único modelo marketplace documentado es
  Payouts (JPay cobra y después reparte), que es la Opción B. Confirma la Opción A.
- OXXO: tope $11.000 MXN por orden; comercio sin verificar, máximo $500 en efectivo (409).

**Siguen sin respuesta (preguntar a Ecart Pay; no bloquean el arranque)**

1. API para mandar un cobro a una terminal física y saber el resultado. La guía de Odoo lo hace
   (sincroniza terminales, envía el cobro, consulta hasta 3 min) pero no publica las llamadas, y
   las órdenes no tienen campos de sucursal/caja.
2. Cómo marcar como pagada una referencia OXXO en sandbox (para SPEI sí existe
   `POST /webhooks/stp`) y si hay terminal virtual para pruebas.
3. Formato real del webhook de órdenes: una página lo muestra plano (`{id, status}`) y otra
   dentro de `{event, data}`; la firma usa `data`. Se verifica en sandbox aceptando ambos.
4. Scopes necesarios para POS, reembolsos y payouts con claves obtenidas por OAuth.
5. Split automático: condiciones para activarlo y cómo aparece en la orden/transacción y en el
   webhook (para conciliarlo). Y sin split: ¿se puede hacer un payout desde la cuenta del
   comercio hacia JPay con sus claves OAuth? (Se programan todas las variantes, ver D3.)
6. Límites generales del sandbox (no documentados).

---

## 3. Parte A — Plataforma neutral por país y por proveedor

---

### 3.1 Principio

Nada del código debería decir "Argentina", "Payway" o "CUIT" en forma fija. Cada uno de esos
conceptos pasa a salir de una configuración:

| Concepto              | Argentina (hoy)                   | México (nuevo)                         | Cómo se vuelve neutral             |
| --------------------- | --------------------------------- | -------------------------------------- | ---------------------------------- |
| Idioma/formato        | es-AR, "$", coma decimal          | es-MX, "$", punto decimal              | `locale` y `currency` del país     |
| Moneda                | ARS                               | MXN                                    | `currency` (ISO 4217)              |
| Zona horaria          | America/Argentina/Buenos_Aires    | America/Mexico_City                    | `timezone` del país                |
| Identificación fiscal | CUIT / CUIL / DNI                 | RFC / CURP                             | `tax_id_type` + validador por país |
| Cuenta bancaria       | CBU / CVU / alias                 | CLABE (18 dígitos)                     | `bank_account_type` + validador    |
| Transferencias        | BDC / Coelsa                      | SPEI (STP vía Ecart Pay)               | proveedor de transferencias        |
| Tarjetas              | Payway                            | Ecart Pay                              | proveedor de pagos                 |
| Efectivo              | —                                 | OXXO                                   | método de pago del proveedor       |
| Impuestos al comercio | IIBB, débitos y créditos, IVA 21% | IVA 16%, ISR/IVA retenidos (si aplica) | módulo fiscal por país             |
| Regulador / reportes  | BCRA, AFIP, UIF/REPET             | CNBV, SAT, UIF México (listas PLD)     | módulo regulatorio por país        |
| Textos legales        | Leyes 24.240, 25.326…             | LFPDPPP, Ley Fintech…                  | legales por país                   |
| Calendario hábil      | feriados AR                       | feriados MX                            | tabla de feriados por país         |

### 3.2 Base de datos (migraciones nuevas, sin romper lo existente)

1. `paises` (catálogo): `codigo` (AR, MX…), `nombre`, `locale`, `currency`, `timezone`,
   `tax_id_type` (CUIT, RFC…), `bank_account_type` (CBU, CLABE…), `phone_prefix`,
   `modulos` (jsonb con flags: `iibb`, `debitos_creditos`, `bcra`, `cfdi`, `oxxo`, `spei`…).
2. `clientes.pais` y `comercios.pais` (default el país de la instalación). Columnas genéricas
   nuevas: `tax_id`, `tax_id_type`, `bank_account`, `bank_account_type`; las viejas (`cuit`,
   `cbu`) se mantienen hasta migrar, luego quedan como vista de compatibilidad.
3. `feriados (pais, fecha, descripcion)` y `sumar_dias_habiles` recibe el país.
4. `proveedores_pago` (catálogo): `codigo` (payway, ecartpay, bdc…), `nombre`, `pais`,
   `tipos` (tarjeta, transferencia, efectivo, pos), `activo`, `sandbox` (bool).
5. `comercio_proveedores`: qué proveedor usa cada comercio y su conexión:
   `comercio_id`, `proveedor`, `estado` (pendiente, conectado, revocado), `cuenta_externa_id`
   (account_id de Ecart Pay), `public_id`, `secreto_ref` (referencia a Supabase Vault, nunca el
   secreto en texto plano), `scopes`, `conectado_at`, `entorno` (sandbox/produccion),
   `modelo_fondos` (`directo` | `centralizado`, null = default de la instalación),
   `cobro_comision` (`split_proveedor` | `descuento_liquidacion` | `cobro_aparte`), y la
   comisión (`comision_pct`, `comision_fija`, null = default). Los defaults viven en una tabla
   `configuracion_pagos` por país/proveedor editable desde admin.
6. `pagos` (genérica, reemplaza a futuro `pagos_intentos_payway` y las columnas `payway_*`):
   `id`, `proveedor`, `proveedor_pago_id`, `proveedor_orden_id`, `comercio_id`, `link_id`,
   `pos_caja_id`, `metodo` (card, transfer, cash, pos, wallet), `monto`, `moneda`, `estado`
   (creado, pendiente, pagado, rechazado, cancelado, reembolsado, parcialmente_reembolsado),
   `estado_proveedor` (texto crudo), `cuotas`, `fee` / `fee_detalle`, `respuesta` (jsonb),
   `idempotency_key` (único), timestamps.
7. `webhook_eventos`: `proveedor`, `evento`, `id_externo`, `firma_valida`, `payload` (jsonb),
   `procesado_at`, `error`, único por (`proveedor`, `webhook_id`) para no procesar dos veces.
8. Puntos físicos (hoy no existen):
   - `sucursales`: `comercio_id`, `nombre`, dirección, horario, `timezone`, `estado`,
     `proveedor`, `id_externo` (pos_branches_id de Ecart Pay).
   - `cajas`: `sucursal_id`, `nombre`, `numero`, `estado`, `config` (reembolsos, topes, copias de
     ticket), `id_externo` (pos_sales_registers_id).
   - `terminales`: `caja_id` (1 a 1), `tipo` (terminal, kiosco, tap_to_phone), `modo`
     (STANDALONE / POINT_OF_SALE), `serie`, `estado`, `id_externo` (pos_information_id).
   - `puntos_venta` actual (QR) se conserva y se relaciona con `cajas` cuando corresponda.
9. Columnas con nombre de proveedor (`comision_payway`, `tasa_payway_*`, `motivo_payway`…):
   se agregan equivalentes genéricas (`comision_pasarela`, `tasa_pasarela_*`, `motivo_proveedor`)
   y una vista de compatibilidad; el código nuevo usa solo las genéricas.
10. RPCs nuevas genéricas: `registrar_pago(proveedor, …)`, `actualizar_estado_pago(…)`,
    `registrar_reembolso(…)`. `registrar_pago_payway` queda como envoltorio de la genérica.
11. Regenerar tipos (`npm run gen:types`) en ambos repos después de cada migración.

### 3.3 Código compartido (src/shared, igual en ambos repos)

1. `shared/pais.ts`: `getPais()` lee el país activo (de la configuración de la instalación y,
   cuando aplique, del comercio). Expone `locale`, `currency`, `timezone`, validadores.
2. `shared/format.ts`: `formatMoney` y `formatDate` usan `locale`/`currency` del país en vez de
   `es-AR` fijo. `formatCuit` → `formatTaxId(valor, tipo)`. Los tests cubren AR y MX.
3. `shared/validadores/`: `rfc.ts`, `curp.ts`, `clabe.ts` (dígito verificador), `cuit.ts`,
   `cbu.ts`. Cada país registra los suyos.
4. `shared/i18n` mínimo: textos que cambian por país (nombres de documentos, impuestos,
   regulador, leyendas legales). No es traducción de idioma, es "español por país".
5. `brand.json`: agregar `country`, `locale`, `currency`, `timezone`, y sacar
   `regulatoryNote` y `company.cuit` hacia la configuración del país/empresa
   (`company.taxId`, `company.taxIdType`).

### 3.4 Módulos por país (activar/desactivar, no borrar)

- Argentina: IIBB, padrones, débitos y créditos, BCRA, AFIP, REPET, SMVM, Payway, BDC/Coelsa.
- México: CFDI (Ecart Pay billing), PLD/listas UIF México, SPEI, OXXO, MSI (meses sin intereses).
- El menú del admin y del portal se arma según `paises.modulos`: en México no aparecen IIBB ni
  BCRA; en Argentina no aparece OXXO.
- Onboarding (empresas): formulario y documentos por país (MX: RFC, CURP, INE, comprobante de
  domicilio, constancia de situación fiscal; persona física o moral).
- Legales (empresas y admin): `legales.*` por país.

### 3.5 Proveedores intercambiables (adaptadores)

Un único contrato para todos los proveedores, implementado del lado servidor:

```
crearCobro(comercio, orden)          -> { ordenId, linkPago, estado }
consultarCobro(comercio, ordenId)    -> { estado, pagos[] }
reembolsar(comercio, ordenId, monto) -> { reembolsoId, estado }
crearLinkPago / actualizar / borrar
cobrarEnTerminal(comercio, caja, monto) -> { ordenId }   (si el proveedor tiene POS)
validarWebhook(headers, body)        -> evento normalizado
```

- `supabase/functions/_shared/proveedores/ecartpay.ts` (nuevo), `payway.ts` (cuando el backend
  de Payway pase a Edge Functions o se envuelva).
- En el front, `src/lib/payment-processor.ts` deja de exigir campos de Payway (`cardForm`,
  `paywayPaymentId`) y pasa a `{ proveedor, proveedorPagoId }`. El checkout elige la
  implementación según el proveedor del comercio.
- Los métodos de pago dejan de estar fijos en `features/checkout/utils.ts`: vienen del
  proveedor/comercio (tabla `banderas` por país + `comercio_banderas`).

---

## 4. Parte B — Integración Ecart Pay (fase por fase)

---

Regla general: el navegador nunca ve claves privadas. Todo lo que usa `private_id`, el token de
Ecart Pay o el secreto de webhooks vive en Edge Functions de Supabase (como las que ya existen),
con los secretos en Supabase Vault / secrets.

### Fase 1 — Configuración base México

Hacer:

- Migraciones de 3.2 (puntos 1–5) y datos de México: país MX, moneda MXN, timezone
  America/Mexico_City, feriados MX 2026–2027, proveedor `ecartpay` (sandbox = true).
- `shared/pais.ts`, `format.ts` neutral, validadores RFC/CURP/CLABE (3.3).
- Admin > Configuración: pantalla "País y proveedores" (ver y editar `paises`,
  `proveedores_pago`, flags de módulos).
  Listo cuando: con país MX, los montos se ven "$1,234.50", fechas en hora de CDMX, el onboarding
  pide RFC y valida CLABE; con país AR todo se ve como hoy (tests de ambos).

**Estado (2026-10-27): HECHA** en las ramas `feature/ecartpay-fase1` (admin y empresas).

- Base (migración `1015_paises_proveedores.sql`, aplicada): `paises` (MX instalación, AR inactivo),
  `feriados` (días inhábiles bancarios MX 2026–2027), `proveedores_pago` (ecartpay sandbox;
  payway y bdc inactivos), `configuracion_pagos` (defaults: directo, cobro aparte, IVA 16%),
  `comercio_proveedores` (conexión + overrides por comercio), `clientes.pais/tax_id/id_personal/
  regimen_fiscal/cuenta_bancaria`, `comercios.pais`, `sumar_dias_habiles(fecha, dias, pais)`.
  RLS: catálogos de lectura, edición solo admin.
- `clientes.cuit` sigue siendo el identificador interno (legajo); en México es el número con
  prefijo 99 que asigna el registro y el RFC va en `tax_id`.
- Compartido: `shared/pais.ts` (MX/AR), `shared/validadores.ts` (RFC, CURP, CLABE, CUIT, CBU con
  dígito verificador), `format.ts` por país (`$1,234.50`), `parseMonto` por país (los campos de
  monto aceptan "1,234.50"). `brand.json` con `country: "MX"`.
- Empresas: onboarding con RFC/CURP/régimen SAT/CLABE, estados, colonia, CP de 5 dígitos, INE;
  textos PLD/PEP de México; sin leyendas BCRA. "Mi cuenta" muestra RFC/CURP. Edge Function
  `crear-cliente` por país (desplegada, compatible con el portal anterior).
- Admin: Configuración > "País y proveedores" (modelo de fondos, cobro de comisión, comisión e
  IVA con ejemplo, proveedores, países y módulos, feriados). Listados y ficha del cliente con el
  identificador fiscal del país.
- Probado de punta a punta en local: alta de persona moral MX, validaciones (RFC, CLABE, CP),
  datos guardados, ficha en admin y guardado de la configuración de pagos.
- Fechas: se muestran en la hora del navegador (en México coincide con CDMX); el servidor usa
  `paises.timezone`.

Pendiente (fases siguientes o decisión del usuario):
- Textos legales (términos, privacidad) y landing siguen siendo argentinos: hay que redactarlos
  para México (no se inventan textos legales).
- Módulos argentinos (transferencias BDC, IIBB, BCRA, impuestos AR) siguen visibles; el menú por
  `paises.modulos` se arma junto con SPEI (Fase 6).
- En persona moral, los datos del representante legal (RFC/CURP) no se guardan (igual que antes
  en Argentina con su CUIT/CUIL).

### Fase 2 — Conexión con Ecart Pay (servidor)

Hacer:

- Secrets en Supabase: `ECARTPAY_ENV` (sandbox|production), `ECARTPAY_BASE_URL`
  (https://sandbox.ecartpay.com), `ECARTPAY_PUBLIC_KEY`, `ECARTPAY_PRIVATE_KEY` (cuenta de JPay),
  `ECARTPAY_OAUTH_CLIENT_ID`, `ECARTPAY_OAUTH_CLIENT_SECRET`, `ECARTPAY_WEBHOOK_SECRET`.
- `_shared/proveedores/ecartpay.ts`:
  - `obtenerToken(publicKey, privateKey)`: `POST /api/authorizations/token` con Basic auth;
    el token dura 1 hora → cache en memoria/tabla con vencimiento a los 55 min.
  - Cliente HTTP con reintentos y el header de autorización correcto (confirmar si lleva
    "Bearer", pregunta 3).
  - Conversión de montos: OJO, `payments[].amount` viene en centavos y `totals` en unidades.
- Edge Function `ecartpay-salud`: prueba de conexión (genera token, lista transacciones) para el
  admin.
- Admin > Integraciones: tarjeta "Ecart Pay" con estado de conexión, entorno (sandbox/prod) y
  botón "Probar conexión".
  Listo cuando: el admin ve "Conectado (sandbox)".

**Estado (2026-10-27): HECHA** en las ramas `feature/ecartpay-fase2` (admin y empresas).

- Panel del usuario: `https://appdev.ecartpay.com`; su API es `https://sandbox.ecartpay.com`
  (visto en el tráfico del panel). El prefijo `oauth_live_` del client_id es solo el nombre.
- App OAuth "JPay" creada en el panel (66 permisos) con redirect
  `https://ovbozgezuboftcjwxlwj.supabase.co/functions/v1/ecartpay-oauth-callback`; webhook a
  `.../functions/v1/ecartpay-webhook` suscrito a los 32 eventos. Secretos cargados por el usuario.
- No hizo falta `ECARTPAY_ENV`: el entorno sale de `proveedores_pago.sandbox`
  (`ECARTPAY_BASE_URL` opcional fuerza otra URL).
- `_shared/ecartpay.ts` (compartido, con tests Deno): token con caché hasta 5 min antes del `exp`,
  reintentos de GET ante red/429/5xx, ante 401 renueva el token y luego prueba sin "Bearer".
  **Confirmado: la API acepta `Authorization: Bearer <token>`.**
- Migración 1016: `proveedores_pago.conexion_estado|conexion_verificada_at|conexion_detalle`.
- Edge Function `ecartpay-salud` (solo `is_admin()`), desplegada. Prueba real: 5/5 pasos OK,
  ~830 ms, `GET /api/transactions` con 0 registros.
- Admin > Integraciones > País y proveedores: tarjeta "Ecart Pay" con estado, URL, pasos y
  botón "Probar conexión".

### Fase 3 — El comercio conecta su cuenta (OAuth) (D1)

Hacer:

- Una sola vez: crear la app OAuth (`POST /api/oauth/applications`) con
  `redirect_url = https://<portal-empresas>/integraciones/ecartpay/callback` (y la de sandbox /
  localhost), logo, textos de onboarding. Guardar `client_id` y `client_secret`.
- Empresas > "Medios de cobro" (o "Integraciones"): botón "Conectar Ecart Pay".
  1. Edge Function `ecartpay-oauth-inicio`: genera `state` (guardado en base, ligado al usuario,
     vence en 10 min) y devuelve la URL `https://<base>/oauth?client_id&redirect_uri&state`.
  2. El comercio inicia sesión en Ecart Pay, hace KYC si falta y acepta.
  3. Ruta `/integraciones/ecartpay/callback` en empresas → Edge Function `ecartpay-oauth-callback`:
     valida `state`, intercambia el `code` (`POST /api/oauth/token`, 5 min de vida) y guarda
     `account_id`, `public_id`, `scope` en `comercio_proveedores` y `private_id` en Vault.
  4. Muestra "Conectado" con fecha y permisos.
- Desconectar: marca `revocado` y borra el secreto (y avisa que debe revocar en Ecart Pay).
- Admin > ficha del comercio: estado de la conexión, cuenta Ecart Pay, permisos, entorno; y
  listado general de comercios conectados / pendientes.
  Listo cuando: un comercio de prueba conecta su cuenta sandbox y el admin lo ve.

**Estado (2026-10-28): HECHA** en las ramas `feature/ecartpay-fase3` (admin y empresas).

- Migraciones 1019 (`oauth_estados`, `revocado_at`/`ultimo_error`, `proveedor_*_secreto` con
  Vault, solo service role) y 1020 (el state vence a los 60 min: el KYC puede tardar).
- Edge Functions (repo empresas): `ecartpay-oauth-inicio`, `ecartpay-oauth-callback` (pública,
  `--no-verify-jwt`; consume el state de forma atómica, canjea el code, verifica las claves
  pidiendo un token, guarda `private_id` en Vault y vuelve al portal con `?ecartpay=`),
  `ecartpay-oauth-desconectar` (dueño o admin). `_shared/conexiones.ts`: comercio de la sesión y
  URL de vuelta solo a `APP_URL` o localhost (sin redirector abierto).
- El redirect es la Edge Function (no una ruta del portal), así no depende del dominio final.
- Empresas: nueva sección "Integraciones" (`/app/integraciones`) con la tarjeta Ecart Pay.
  Admin: tarjeta "Comercios conectados" en País y proveedores.
- Prueba real: "Comercio Demo MX" (creado para `empresa.mx@jpay.example`) quedó conectado en
  sandbox con 66 permisos y la clave en Vault. La desconexión no se probó de punta a punta.
- **Error del sandbox de Ecart Pay (reportar):** si el comercio tiene que hacer el KYC dentro del
  flujo, al terminar lo manda a `https://appdev.ecartpay.com/api/oauth/complete?...` (host del
  panel, que devuelve la SPA en blanco) en vez del host de la API. Reintentar el flujo con la
  cuenta ya verificada funciona.

### Fase 4 — Cobros online (links de pago y checkout con tarjeta)

Hacer:

- Links de pago (empresas > Link de pago): al crear un link de JPay se crea en Ecart Pay
  (`POST /api/templates`, o una orden por cobro según el caso) y se guarda el id externo.
  Editar/borrar/pausar sincroniza (`PUT` / `DELETE /api/templates/{id}`).
- Checkout público (`p.$code`): dos caminos, elegir uno por comercio:
  a) Redirigir al `pay_link` de Ecart Pay (más simple y rápido para sandbox).
  b) Checkout embebido con el SDK `pay.js` (`Pay.Checkout.create`) o tokenización
  (`Pay.Cards.render` → `POST /api/tokens` → `POST /api/orders` con `token`).
  Recomendación: (a) primero, (b) después para mantener la experiencia de marca.
- 3D Secure: `POST /api/three-d-secure` → redirigir → al volver, confirmar SIEMPRE con
  `GET /api/orders/{id}` que el estado sea `paid` (nunca confiar solo en la redirección).
- Cuotas MSI (meses sin intereses, solo MXN): leer/activar con `/api/cards/msi-configuration`;
  en admin se configura por comercio.
- Idempotencia: cada intento de pago con `idempotency_key` propia en `pagos`; nunca crear dos
  órdenes para el mismo intento.
- Google Pay / Apple Pay: fase posterior (requieren dominio verificado y aprobación).
  Listo cuando: con tarjeta 4242 4242 4242 4242 (12/2050) el pago queda `pagado` en la base y en el
  historial del comercio; con 4622 9431 2701 3705 queda `rechazado` con mensaje claro.

**Estado (2026-10-28): EN CURSO** en las ramas `feature/ecartpay-fase4` (admin y empresas).
Hecho el camino (a), redirección al `pay_link`:

- Migración 1021: tabla `pagos` (genérica, `idempotency_key` única, RLS de lectura para el
  comercio y el backoffice) y `aplicar_estado_pago` (único punto que cambia el estado;
  idempotente; al quedar `pagado` registra el cobro en `cliente_links_pago_pagos` y suma el
  contador del link; no toca saldos ni ledger porque en `directo` el dinero queda en Ecart Pay).
- Edge Function `ecartpay-checkout` (acciones `info`, `crear`, `confirmar`): la orden se crea
  con las claves del comercio (Vault); `confirmar` siempre consulta `GET /api/orders/{id}`.
- Cliente compartido: `resumirOrden` (estado de la orden → estado JPay; intento fallido =
  `rechazado` con motivo), con tests.
- Checkout `/p/$code`: si el comercio tiene Ecart Pay conectado, pide nombre y email y redirige a
  Ecart Pay; al volver (`?pago=`) consulta el estado cada 3 s mientras siga abierto. Sin Ecart
  Pay, el checkout de Payway sigue igual.
- Probado: la orden se crea en la cuenta conectada y redirige a `checkoutdev.ecartpay.com`.
  Ecart Pay valida el email (`@jpay.example` → 422; ahora se muestra el motivo).
- **Bloqueado por Ecart Pay:** el checkout responde "The account has not active payment methods":
  la pasarela "EcartPay México" de la cuenta figura `Inactivo` hasta que Ecart Pay revise la
  "Documentación empresarial requerida" (el panel pide contactar al agente de ventas). Falta la
  prueba con 4242… / 4622… y el formato real de los intentos rechazados en la orden.
- Pendiente de la fase: links de pago sincronizados como templates de Ecart Pay, MSI por
  comercio y checkout embebido (camino b).

### Fase 5 — Avisos automáticos (webhooks) y estados

Hacer:

- Edge Function pública `ecartpay-webhook` (sin verify_jwt; la autenticidad la da la firma):
  - Verificar firma HMAC-SHA256: `x-pay-signature = SHA256=hex(HMAC(secret,
`${x-pay-timestamp}.${x-pay-webhook-id}.${JSON.stringify(body.data)}`))`. Si no valida, 401.
  - Rechazar timestamps viejos (por ejemplo > 5 min) para evitar repeticiones.
  - Guardar en `webhook_eventos` (idempotente por `x-pay-webhook-id`) y responder 200 en < 5 s.
  - Procesar después (o en la misma función si es rápido): para órdenes, el payload trae solo
    `{id, status}` → consultar `GET /api/orders/{id}` y actualizar `pagos` + ledger.
- Registrar los eventos con `POST /api/webhooks` (por cuenta: la de JPay y, con OAuth, cada
  comercio si la API lo permite — pregunta 6): `orders.create`, `orders.update`,
  `orders.confirmation`, `transactions.paid`, `transfer.created`, `chargebacks.create`,
  `chargebacks.update`, `withdrawals.processing/paid/cancelled`, `subscription.*` (si se usa).
- Además, `notify_url` en cada orden apuntando a la misma función (respaldo).
- Tarea programada (pg_cron, ya existe en la base): cada 5 min revisa pagos `pendiente` de más de
  10 min y los consulta a Ecart Pay (por si se perdió un aviso).
- Admin > Integraciones > Ecart Pay > "Eventos": lista de webhooks recibidos, firma válida,
  error, botón "reprocesar".
  Listo cuando: pagar en sandbox actualiza el estado en segundos sin recargar (realtime ya
  existe), y un webhook con firma mala queda rechazado y registrado.

**Estado (2026-10-28): HECHA** en las ramas `feature/ecartpay-fase5` (admin y empresas).

- **Formato real confirmado (pregunta 3 resuelta):** los webhooks de la cuenta llegan como
  `{"event": "orders.create", "data": {"id", "status"}}`, firmados sobre `JSON.stringify(data)`
  con `x-pay-timestamp` en milisegundos. Se verificaron webhooks reales de Ecart Pay
  (`firma_valida = true`). Ecart Pay mandó dos avisos (webhook_id distintos) por la misma orden.
- Principio de diseño: un aviso NUNCA cambia un estado por su contenido; solo dispara
  `GET /api/orders/{id}` (`_shared/pagos.ts`: `confirmarPago`, `procesarEvento`). Probado: un
  aviso sin firma que decía `paid` dejó el pago en `creado` porque la orden seguía `created`.
- Migración 1022: `webhook_eventos` (único por webhook_id firmado), `tareas_programadas` y
  `reservar_tarea`. Migración 1023: pg_cron cada 5 min → `ecartpay-pendientes`.
- Edge Functions públicas (`--no-verify-jwt`): `ecartpay-webhook` (firma inválida → 401 y
  registro; también recibe el `notify_url` de cada orden, sin firma) y `ecartpay-pendientes`
  (reconsulta pagos abiertos de 2 min a 7 días, máximo una corrida cada 4 min; con `evento_id`
  reprocesa un aviso, solo admins).
- No se rechazan timestamps viejos: la repetición es inofensiva (idempotencia + consulta).
- Admin > País y proveedores: tarjeta "Avisos de Ecart Pay" (firma, resultado, error, última
  revisión de pendientes, "Reprocesar"). Probado en local.
- Sin hacer: registrar webhooks por API en la cuenta de cada comercio (`POST /api/webhooks`); con
  `notify_url` por orden más la tarea de pendientes alcanza para sus órdenes.

### Fase 6 — Transferencias SPEI y efectivo OXXO

Hacer:

- SPEI (cobro por transferencia): `POST /api/orders/{id}/process` con el método
  "Bank Transfer" → CLABE única por orden (en `payments[].id` de la orden pública). El checkout
  muestra CLABE, banco, monto y referencia; el pago se confirma por webhook
  (`transfer.created` + `transactions.paid`).
- OXXO (efectivo): habilitar `cash` en `available_payment_methods`; mostrar referencia y código
  de barras (`payments[0].method.reference`, `barcode_url`); vence en 5 días; tope $11,000 MXN
  ($500 si el comercio no está verificado).
- Datos bancarios del comercio en México: CLABE (validada) para retiros; pantalla de retiros
  con `GET /api/withdrawals` (Ecart Pay no documenta crear retiros por API: se hacen desde su
  panel).
- Las transferencias salientes argentinas (BDC) quedan solo para país AR.
  Listo cuando: en sandbox, una orden SPEI se paga con la simulación de STP
  (`POST https://sandbox.ecartpay.com/webhooks/stp`) y queda `pagado`; una orden OXXO queda
  `pendiente` con su referencia (el pago en tienda se confirma con Ecart Pay, pregunta 2).

**Estado (2026-10-28): SPEI y OXXO HECHOS** en las ramas `feature/ecartpay-fase6` (admin y
empresas). Funcionan aunque la pasarela de tarjeta de la cuenta esté inactiva.

- `ecartpay-checkout` acepta `metodo` (`tarjeta` | `spei` | `oxxo`): crea la orden, la procesa
  (`POST /api/orders/{id}/process` con el `method_id` documentado) y lee la referencia de la
  orden pública (`leerReferenciaPago`, con tests). OXXO valida el tope de $11,000.
- Migraciones 1024 (`pagos.referencia`, `referencia_vence_at`, `referencia_url`) y 1025 (el método
  del pago no se pisa al confirmar).
- Checkout: selector Tarjeta / Transferencia SPEI / Efectivo en OXXO; pantalla con la CLABE
  (copiar), banco STP y vencimiento, o la referencia OXXO con código de barras; se actualiza sola
  (cada 15 s) cuando llega el pago.
- **Probado de punta a punta (SPEI):** CLABE única generada → simulación STP del sandbox →
  webhooks firmados (`transfer.created`, `transactions.paid`, `orders.confirmation` paid) → el
  pago quedó `pagado`, registrado en el link, y la pantalla del pagador pasó sola a "Pago
  aprobado". OXXO: referencia y código de barras generados (sin simulación de pago en tienda
  documentada: pregunta 2 sigue abierta).
- Ecart Pay rechaza a veces UUIDs en `metafields` ("must not contain payment card or bank
  account data"): se dejó de mandar `metafields`; el id del pago va en `reference`.
- Pendiente de la fase: retiros (`GET /api/withdrawals`) y menú por `paises.modulos`.

### Fase 7 — Puntos físicos (sucursales, cajas y terminales)

Estructura Ecart Pay: Sucursal → Caja → Terminal (una terminal por caja).

Empresas (el comercio):

- "Puntos físicos" (nuevo menú, junto a QR):
  - Sucursales: alta/edición/baja (nombre, dirección, horario, zona horaria) →
    `POST/PUT/DELETE /api/pos/branches`; "¿abierta ahora?" con `/status`.
  - Cajas por sucursal: alta/edición (número, permisos de reembolso, tope, aprobación de
    gerente, copias de ticket) → `/api/pos/sales-registers`.
  - Terminales: ver las terminales de su cuenta (`GET /api/pos/terminals/point-of-sale`),
    vincular/desvincular a una caja (`link-terminal` / `unlink-terminal`) y cambiar modo
    (`enable-pos` / `disable-pos`).
  - "Cobrar en caja": el cajero elige caja, monto y concepto → se envía el cobro a la terminal
    de esa caja (llamada NO documentada, pregunta 1 de la sección 2; queda detrás de un
    adaptador) → pantalla "Esperando terminal…" que consulta el
    estado (máx. 3 minutos, como el módulo oficial de Odoo) → aprobado / rechazado / tiempo
    agotado ("revisá la terminal antes de reintentar para no cobrar dos veces").
  - Ventas por sucursal y por caja (historial y KPIs), cierre de caja (resumen del día).
- Tap to Phone (si aplica, D5): app Android aparte (SDK nativo de Ecart Pay); la plataforma solo
  registra el dispositivo como terminal tipo `tap_to_phone` y recibe los pagos por webhook.
- Kiosco PAX SK700 (si aplica): app Android local con el SDK que entrega Ecart Pay; idem.

Admin:

- Vista de todas las sucursales, cajas y terminales por comercio, con estado y última venta.
- Alta/asignación de terminales físicas a comercios (inventario de equipos, número de serie).
- Reglas: topes de reembolso por caja, horarios, bloqueo de una caja o terminal.
- Reportes de ventas presenciales.

Sincronización: al crear en JPay se crea en Ecart Pay y se guarda `id_externo`; un botón
"Sincronizar con Ecart Pay" trae lo que se haya creado desde su panel (como hace Odoo).
Listo cuando: en sandbox se crea sucursal + caja, se vincula una terminal (o la de prueba que
indique Ecart Pay, pregunta 1–2) y un cobro en caja termina en `pagado` o `rechazado` con su
pantalla de espera.

**Estado (2026-10-28): GESTIÓN HECHA, cobro en caja pendiente** en las ramas
`feature/ecartpay-fase7` (admin y empresas). La API de POS funciona con la pasarela inactiva.

- Migración 1026: `sucursales`, `cajas` (número único por sucursal, una terminal por caja) y
  `terminales`, con `id_externo` del proveedor, bajas lógicas y RLS de lectura (comercio dueño y
  backoffice); escriben solo las Edge Functions.
- Edge Function `ecartpay-pos` (comercio dueño o admin): sincronizar (trae lo creado en el panel
  de Ecart Pay, da de baja lo que ya no existe, no duplica), alta/edición/baja de sucursales y
  cajas (primero en Ecart Pay, después en JPay), vincular/desvincular terminal y modo punto de
  venta. Cliente compartido: mapeos sucursal/caja/terminal con tests y `listarTodo` paginado.
- Empresas: menú "Puntos físicos" (`/app/puntos-fisicos`): sucursales con sus cajas, terminal de
  cada caja, formularios, baja con confirmación, "Sincronizar con Ecart Pay". Admin: tarjeta
  "Puntos físicos" con las sucursales de todos los comercios.
- Probado: sucursal y cajas creadas en Ecart Pay desde el portal, sincronización sin duplicar,
  baja de caja. Si Ecart Pay no devuelve un ajuste de caja (p. ej. copias de ticket), la
  sincronización no pisa el valor de JPay.
- La cuenta no tiene terminales: falta probar vincular/modo con una real o de prueba.
- **Cobrar en caja: bloqueado** (pregunta 1: no hay API publicada para enviar un cobro a una
  terminal). El portal lo aclara.

### Fase 8 — Reembolsos, contracargos, conciliación y reportes

Hacer:

- Reembolsos: desde el detalle de un pago (empresas, y admin con permiso):
  `POST /api/orders/{id}/refund` con `amount` y `reason` (requested, duplicate, fraudulent);
  parcial o total; respetar topes de la caja si es presencial. Estado por webhook/consulta.
- Contracargos: webhooks `chargebacks.create/update` → tabla `contracargos` (columnas genéricas);
  el comercio tiene 5 días para subir evidencia (reutilizar la pantalla actual de contracargos
  del admin y sumar la vista del comercio); actualizar con `PUT /api/chargebacks/{id}`.
- Conciliación: tarea diaria que trae `GET /api/transactions` (paginación por token `next` a
  partir de la página 10) y compara contra `pagos`; diferencias a una bandeja en admin.
- Comisiones: `fee` / `fee_details` de Ecart Pay + comisión JPay (D3) → ledger existente.
- Reportes (admin y empresas): ventas por día, por método (tarjeta/SPEI/OXXO/terminal), por
  sucursal/caja, comisiones, reembolsos y contracargos; exportar Excel/PDF (ya existe la base).
- Facturación CFDI (si D4): datos fiscales del comercio y descarga de CFDI desde Ecart Pay.
  Listo cuando: un reembolso parcial en sandbox se refleja en el pago, el saldo y el reporte; la
  conciliación del día no muestra diferencias.

### Fase 9 — Pruebas completas en sandbox y salida a producción

Lista de pruebas (todas en sandbox, con evidencia en una planilla):

| #   | Escenario                   | Dato de prueba                                         | Resultado esperado                                  |
| --- | --------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| 1   | Conectar comercio por OAuth | cuenta sandbox                                         | "Conectado", credenciales guardadas en Vault        |
| 2   | Pago con tarjeta aprobada   | Visa 4242424242424242, 12/2050, CVC 123                | `pagado`, historial y saldo actualizados            |
| 3   | Pago con tarjeta rechazada  | Visa 4622943127013705, 10/2050                         | `rechazado` + mensaje claro                         |
| 4   | 3DS sin fricción            | Visa 4000000000002701, 01/2050                         | `pagado`                                            |
| 5   | 3DS con desafío OK          | Visa 4000000000002503, 11/2050                         | redirección y `pagado`                              |
| 6   | 3DS con desafío fallido     | Visa 4000000000002370, 11/2050                         | `rechazado`                                         |
| 7   | Mastercard / Amex aprobada  | 5555555555554444 (11/2050) / 378282246310005 (09/2050) | `pagado`                                            |
| 8   | SPEI                        | orden con transferencia + simulación STP               | `pagado` vía webhook                                |
| 9   | OXXO                        | orden en efectivo                                      | `pendiente` con referencia; vence a los 5 días      |
| 10  | Link de pago multiuso       | template con usos ilimitados                           | cada uso crea su orden                              |
| 11  | Webhook con firma inválida  | firma alterada                                         | 401 y registro en "Eventos"                         |
| 12  | Webhook duplicado           | mismo `x-pay-webhook-id`                               | se procesa una sola vez                             |
| 13  | Webhook perdido             | apagar la función                                      | la tarea programada lo recupera                     |
| 14  | Reembolso parcial y total   | pago aprobado                                          | `parcialmente_reembolsado` / `reembolsado`          |
| 15  | Sucursal → caja → terminal  | API POS sandbox                                        | ids externos guardados                              |
| 16  | Cobro en caja               | terminal de prueba                                     | `pagado`/`rechazado`/timeout con pantalla de espera |
| 17  | Contracargo                 | evento de prueba                                       | aparece en admin y empresas con plazo de 5 días     |
| 18  | País AR sigue igual         | flujo Payway actual                                    | sin cambios (regresión)                             |
| 19  | Desconectar comercio        | botón desconectar                                      | no se pueden crear cobros nuevos                    |
| 20  | Token vencido               | esperar > 1 h                                          | se renueva solo, sin error al usuario               |

Además: tests automáticos (vitest) de adaptadores, firma de webhooks, conversión de montos y
validadores; pruebas end-to-end en el navegador de los flujos 2, 5, 8, 10, 16.

Salida a producción (checklist):

- Credenciales de producción en secrets (no en el código), `ECARTPAY_ENV=production`.
- App OAuth de producción con `redirect_url` del dominio final.
- Webhooks registrados en producción y secreto configurado.
- Dominio verificado para Apple Pay / Google Pay (si se usan).
- Legales México publicados (términos, privacidad LFPDPPP, aviso de comisiones).
- Variables de Vercel: país MX, sin `VITE_PAYWAY_TEST_CARD`.
- Monitoreo: alertas por webhooks fallidos, pagos pendientes viejos y diferencias de
  conciliación.

---

## 5. Qué cambia en cada aplicación (resumen)

---

Portal de empresas (el comercio):

- Onboarding México (RFC, CURP, documentos, CLABE).
- "Medios de cobro": conectar/desconectar Ecart Pay.
- Links de pago y checkout con Ecart Pay (tarjeta, 3DS, MSI, SPEI, OXXO).
- Puntos físicos: sucursales, cajas, terminales, cobrar en caja, cierre de caja.
- Historial, saldo y liquidaciones con pagos de Ecart Pay; reembolsos; contracargos con evidencia.
- Reportes por método, sucursal y caja.

Panel admin (JPay):

- País y proveedores (configuración, módulos por país, sandbox/producción).
- Integración Ecart Pay: salud de la conexión, eventos de webhooks, reprocesar.
- Comercios: estado de conexión Ecart Pay, permisos, métodos habilitados, comisiones (D3), MSI.
- Puntos físicos de todos los comercios, inventario de terminales.
- Reembolsos y contracargos (gestión y seguimiento), conciliación diaria, reportes.

Supabase (servidor):

- Migraciones de 3.2, datos de México, Vault para secretos.
- Edge Functions nuevas: `ecartpay-salud`, `ecartpay-oauth-inicio`, `ecartpay-oauth-callback`,
  `ecartpay-cobros` (crear orden / link / reembolso / cobro en caja), `ecartpay-webhook`,
  `ecartpay-conciliacion` (programada), `ecartpay-pos` (sucursales, cajas, terminales).
- Adaptador compartido `_shared/proveedores/ecartpay.ts`.

---

## 6. Riesgos y cómo los cubrimos

---

- Documentación incompleta (terminales, firma de webhooks de órdenes, estados): no confiar en un
  solo canal → webhook + consulta de la orden + tarea programada que reconsulta pendientes.
- Doble cobro: idempotencia por intento, nunca reintentar un cobro en terminal sin consultar
  el estado, pantalla de espera con aviso.
- Montos en centavos vs. unidades: una sola función de conversión con tests.
- Claves privadas: solo en Edge Functions y Vault; rotación documentada.
- Regulación (D1): si se elige custodiar fondos (Opción B), validar licencias antes de construir.
- Mezcla AR/MX: cambios detrás de configuración por país y tests de regresión de Argentina.

---

## 7. Referencias

---

Documentación Ecart Pay: https://docs.ecartpay.com (índice: https://docs.ecartpay.com/llms.txt)

- OAuth: /docs/oauth-ecart-pay · Token: /docs/authorization-token · API keys: /docs/api-keys
- Órdenes: /docs/orders, /docs/refunds, /docs/transfers · Links: /docs/payment-links
- Checkout: /docs/checkout · SDK: /docs/sdks · Tokenización: /docs/tokenization · 3DS:
  /docs/3d-secure-3ds-payment-flow
- Webhooks: /docs/webhooks-in-ecart-pay, /docs/webhook-events, /docs/webhook-authentication
- POS: /docs/point-of-sales-integration, /docs/branch-management, /docs/sales-register-management,
  /docs/terminal-pos-management, /docs/pos-ecart-pay-integration-guide, /docs/kiosk,
  /docs/sdk-tap-to-phone
- Pruebas: /docs/test-cards-1, /docs/bank-transfer, /docs/oxxo-pay
- Otros: /docs/payouts, /docs/summaries, /docs/chargebacks, /docs/withdrawals,
  /docs/interest-free-and-fixed-installments, /docs/subscriptions, /docs/direct-debits

Código actual relevante:

- Pagos: JPay-empresas/src/lib/payment-processor.ts, src/lib/payway.ts, src/features/checkout/
- Transferencias: JPay-empresas/src/lib/bdc/, recipient-validation.ts, transfer-orchestrator.ts
- QR / puntos de venta: JPay-empresas/src/features/qr/, JPay-admin/src/features/transferencia/
- Formato: src/shared/format.ts (ambos repos) · Marca: src/brand/brand.json
- Base: src/lib/database.types.ts · Arquitectura: ARCHITECTURE.md
