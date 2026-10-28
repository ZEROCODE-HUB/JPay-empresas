# Plan de integración: Cobre (México)

Fecha: 2026-10-28. Documentación: https://docs.cobre.com/llms.txt (copia local de las 504 páginas en
el scratchpad de la sesión, carpeta `cobre/p`).

## 1. Qué es Cobre y dónde encaja en JPay

Cobre no es una pasarela de tarjetas: es una plataforma de **movimiento de dinero entre cuentas**
(México, Colombia, EE. UU.). En México ofrece:

| Producto Cobre | Para qué sirve en JPay | Equivalente en Argentina |
| --- | --- | --- |
| Cobre Balance MXN (`pr_mex_cobre3`) | Cuenta donde vive el dinero; tiene su propia CLABE | Cuenta en BDC |
| CLABEs virtuales (`virtual_clabe_accounts`) | Una CLABE por cliente/subcuenta para recibir depósitos SPEI | CVU |
| Contrapartes (`clabe`, `spei_card`) | Destinatarios frecuentes con CLABE o tarjeta SPEI y RFC/CURP | Destinatarios CBU/CVU |
| Money Movement SPEI (payout) | Transferencias salientes reales | Transferencia por Coelsa |
| Verificación de cuentas | Confirmar que la CLABE es del titular (RFC/CURP) antes de pagar | Consulta de titularidad |
| Devoluciones (`/money_movements_return`) | Devolver un depósito recibido | — |
| Webhooks (`accounts.balance.credit/debit`, `money_movements.status.*`) | Acreditar depósitos y cerrar transferencias | Avisos de BDC |
| Named Accounts (función restringida) | La CLABE del comercio muestra "JPAY \| Comercio" en el SPEI | — |
| R2P / Direct Link (CLABE dinámica de un solo uso) | Cobros puntuales por SPEI | — |

Ecart Pay sigue siendo el proveedor de **cobros** (tarjeta, OXXO, SPEI de links, terminales).
Cobre sería el proveedor de **cuenta y transferencias**: lo que en México hoy está apagado
(`transferencias_salientes` = false) y la CLABE propia de cada cliente.

Hoy las transferencias de JPay solo mueven saldo en la base (`registrar_transferencia_externa`
descuenta y registra el movimiento como acreditado al instante); no salen por ningún riel real.

## 2. Ambientes: no hay sandbox para México

- Cobre tiene ambiente QA (`https://api.qa.cobre.co`) solo para Colombia. **México no está en QA.**
- Para México, Cobre crea una **instancia de prueba previa a producción** (credenciales, usuarios y
  datos propios, aislada de producción). Se pide al Key Account Manager (KAM), y la integración
  solo arranca formalmente con contrato firmado, KAM asignado y "API onboarding" abierto.
- Para salir a producción hay **certificación**: cuestionario + demo en vivo sobre la instancia
  de prueba; Cobre emite un informe con puntaje.

**Qué se puede hacer sin credenciales:** todo el código contra la especificación publicada, con un
**simulador de Cobre** del lado servidor (mismas respuestas, estados y webhooks firmados que
documenta Cobre) para usar y probar los flujos completos en local y en el admin. Cuando lleguen
las credenciales de la instancia de prueba, se cambia el modo `simulado` → `prueba` (variable de
entorno) y se corre la lista de pruebas real. Riesgo: lo que la documentación no dice con
precisión (formatos exactos de algunos campos) se ajusta recién con la instancia real.

## 3. Datos técnicos clave (de la documentación)

- Autenticación: `POST /v1/auth` con `user_id` y `secret` → JWT de 20 min. Cachear y renovar al
  95% (`expiration_time`); nunca pedir token por cada llamada (rate limit). 401 = token vencido.
- Montos en centavos (MXN 2.390,15 → `239015`). Fechas en UTC.
- `POST /v1/money_movements` exige encabezado `idempotency` (≥ 9 caracteres, válido 24 h).
- Paginación: `page_size`, `page_number`, `contents`, `is_last_page` (máx. 10.000 registros).
- Payout SPEI: contraparte (`clabe` o `spei_card`, RFC/CURP) → money movement con `source_id`
  (Cobre Balance), `destination_id` (contraparte), `external_id` (id de JPay), `metadata`
  (`description`, `reference`), `checker_approval` opcional. Estados: `initiated` →
  `processing` (se debita) → `completed` | `rejected` (se reintegra) | `failed`;
  `pending_approval` / `canceled` con aprobación. Códigos de error F001–F099 y R000–R085.
- Depósitos: transacción `spei_credit` en el Cobre Balance; `metadata.account_reference` dice a
  qué CLABE virtual llegó (no hay money movement detrás). Webhook `accounts.balance.credit`.
- Webhooks: suscripción por API (`POST /v1/subscriptions`) con `event_signature_key`; cada envío
  trae `event-timestamp` y `event-signature` = HMAC-SHA256 (hex) de `timestamp + "." + cuerpo
  crudo`. Comparación en tiempo constante. Deduplicar por `id` del objeto.
- Verificación de cuentas (MX): `mex_acc_ownership_1` (CLABE/tarjeta + RFC/CURP → `matched` /
  `unmatched` / `unresolved`) y `mex_acc_details_1` (devuelve el titular). Asíncrona: P50 10 min,
  solo en horario bancario, no repetir antes de 12 h.
- Límite: hay pocos Cobre Balances MX por cliente de Cobre; se recomienda muchas CLABEs virtuales
  sobre un mismo Balance.

## 4. Decisiones (respondidas el 2026-10-28)

- **C1: los dos modelos**, configurable por comercio (`centralizado` = CLABE virtual sobre el
  Balance de JPay; `por_comercio` = Cobre Balance propio). Default: `centralizado`.
- **C2: cuenta y transferencias** (sin R2P/Direct Link por ahora).
- **C4: sí**, aprobación doble sobre un monto configurable.
- C3 (comisiones): configurable por país, IVA 16% en México.

Detalle de cada decisión:

- **C1. Modelo de fondos.**
  a) *Centralizado*: JPay tiene uno o pocos Cobre Balances; cada cliente/subcuenta recibe una
     CLABE virtual; el saldo de cada cliente lo lleva el ledger de JPay (como hoy con CVU).
  b) *Por comercio*: un Cobre Balance (Named Account, "JPAY | Comercio") por cliente; el saldo lo
     lleva Cobre y JPay lo refleja. Requiere que Cobre habilite Named Accounts y tiene cupo.
  Nota: en (a) JPay custodia fondos de terceros, lo que en México suele requerir figura de IFPE
  (Ley Fintech) o un esquema acordado con Cobre. Es una decisión legal/comercial, no técnica.
- **C2. Alcance.** Recomendado: CLABE por cliente + depósitos + transferencias SPEI + destinatarios
  con verificación + devoluciones + conciliación. Opcional después: R2P/Direct Link (se pisa con
  el SPEI de Ecart Pay en links), aprobación doble y pagos masivos.
- **C3. Comisiones de JPay** por transferencia saliente y/o depósito (hoy hay comisión de
  transferencia con IVA 21% fijo de Argentina; en México sería IVA 16% configurable).
- **C4. Aprobación doble** (maker-checker de Cobre) para transferencias sobre cierto monto: sí/no.

## 5. Fases

### Fase C1 — Base y simulador
- Proveedor `cobre` en `proveedores_pago` (tipo `transferencia`, MX) y módulo
  `transferencias_cobre` en `paises.modulos`.
- Cliente `_shared/cobre.ts`: token con caché al 95% y un solo refresco a la vez, encabezado
  `idempotency`, montos en centavos, paginación, errores con su código del diccionario, mapeos de
  estados; tests con `fetch` simulado.
- Simulador (`COBRE_MODO=simulado`): implementa los mismos endpoints sobre tablas propias,
  hace avanzar los estados y emite webhooks firmados hacia `cobre-webhook`.
- Edge Function `cobre-salud` (admin) y tarjeta "Cobre" en País y proveedores.

### Fase C2 — Cuentas y CLABE de cada cliente
- Según C1: alta del Cobre Balance de JPay (o por comercio) y CLABE virtual por cliente/subcuenta
  (`clabe` en la subcuenta, como hoy `cbu`), con baja (deshabilitar).
- Portal: "Mi CLABE para recibir depósitos" (copiar, compartir). Admin: CLABEs por cliente.

### Fase C3 — Depósitos
- Webhook `cobre-webhook` (público, firma obligatoria): `accounts.balance.credit` →
  identifica la subcuenta por `account_reference` → acredita el saldo y registra el movimiento
  (idempotente por id de transacción). Sin CLABE conocida → bandeja de "depósitos sin asignar".
- Tarea de respaldo: lee transacciones del Balance y acredita lo que no llegó por webhook.
- Devolución de un depósito (`/money_movements_return`) desde el admin.

### Fase C4 — Transferencias SPEI salientes
- Destinatarios: CLABE (validada con dígito verificador, ya existe `validarClabe`) o tarjeta SPEI,
  titular y RFC/CURP → contraparte en Cobre; verificación de titularidad opcional (asíncrona).
- Transferir: reserva el saldo en JPay → money movement con `idempotency` y `external_id` →
  movimiento `pendiente` → webhook `completed` (acreditado) o `rejected`/`failed` (reintegra el
  saldo y muestra el motivo R0xx/F0xx en español). OTP actual se mantiene.
- Se reemplaza el "acreditado al instante" de `registrar_transferencia_externa` solo para MX.

### Fase C5 — Conciliación, reportes y alertas
- Conciliación diaria contra transacciones del Balance (por id, nunca por monto y hora).
- Reportes de depósitos/transferencias/comisiones; alertas como las de Ecart Pay.

### Fase C6 — Pruebas en la instancia de Cobre y certificación
- Cambiar a `COBRE_MODO=prueba` con las credenciales que entregue el KAM; registrar la
  suscripción de webhooks; correr la lista de pruebas (sección 6).
- Cuestionario de certificación y demo en vivo. Credenciales de producción en secretos.

## 6. Lista de pruebas (simulador primero, después instancia de Cobre)

| # | Escenario | Esperado |
| --- | --- | --- |
| 1 | Token y renovación | Un solo token por 19 min; 401 → renueva y reintenta una vez |
| 2 | Crear CLABE virtual | La subcuenta muestra su CLABE |
| 3 | Depósito a la CLABE | Saldo acreditado una sola vez, movimiento en historial |
| 4 | Depósito a CLABE desconocida | Bandeja "sin asignar", no acredita a nadie |
| 5 | Webhook con firma inválida | 401 y registrado |
| 6 | Webhook duplicado | Se procesa una vez |
| 7 | Transferencia completada | Pendiente → acreditada |
| 8 | Transferencia rechazada (R005 cuenta inexistente) | Reintegra saldo y comisión, motivo claro |
| 9 | Fondos insuficientes en el Balance (F002) | No debita al cliente; alerta en admin |
| 10 | Reintento con la misma clave | Una sola transferencia (idempotencia) |
| 11 | Verificación de cuenta | matched / unmatched / unresolved visibles |
| 12 | Devolución de un depósito | `spei_return` creado y seguido hasta completed |
| 13 | Conciliación | Sin diferencias; una diferencia forzada aparece una vez |
| 14 | Argentina sigue igual | Transferencias AR sin cambios |
