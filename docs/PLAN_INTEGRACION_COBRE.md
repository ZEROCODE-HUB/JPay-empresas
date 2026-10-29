# Plan de integración: Cobre (México)

Fecha: 2026-10-28. **Documento de referencia:** "Solution Design — integración de JPAY con Cobre"
(Cobre, 2026-10-26). Documentación general: https://docs.cobre.com/llms.txt.

Este plan reemplaza al anterior (fases C1–C5). Lo construido en C1–C5 se reutiliza donde coincide
con el documento de Cobre; lo que no coincide se cambia en las fases D0–D8.

## 1. Qué pide el documento de Cobre

JPay es un PSP sobre su **instancia matriz** de Cobre. Por cada comercio de la plataforma:

1. **Subcliente** (`sc_…`): alta KYB del comercio en Cobre (onboarding FBO). Queda en
   `processing` hasta `approved`. Un `rejected` no se reenvía: se crea un registro nuevo.
2. **Cobre Balance México** (`pr_mex_cobre3`, `acc_…`) creado con el `subclient_id` aprobado
   (Named Account). Su `account_number` es la CLABE del comercio. **No hay balance concentrador.**
3. Con ese Balance el comercio:
   - **cobra** por Direct Link R2P SPEI (una CLABE dinámica por cobro, con vencimiento);
   - **paga** por SPEI, unitario o masivo (lote), a CLABEs verificadas;
   - **convierte** MXN→USD (cotización `mxn/usd` + Cross Border) al Balance **Global** USD de JPay.
4. JPay mueve los USD del Balance Global al **Balance USA** (`global_pay_to_usa`) y desde ahí paga
   por **Fedwire** (EE. UU.) o **SWIFT** (exterior).
5. **Excepción:** un comercio con contrato directo con Cobre usa su **propia instancia**
   (credenciales, webhooks y conciliación propios). El resto de la cartera sigue con Subcliente.

Balances de la instancia matriz: Global USD (`pr_global_cobre`, destino del cruce) y USA
(`pr_usa_cobre`, origen de Fedwire y SWIFT). No son intercambiables.

## 2. Qué cambia respecto de lo construido (C1–C5)

| Tema | C1–C5 | Documento de Cobre |
| --- | --- | --- |
| Fondos MX | `centralizado` (Balance de JPay + CLABE virtual por subcuenta) por defecto; `por_comercio` sin KYB | Subcliente + Balance por comercio, sin concentrador |
| PayIn | Depósitos `spei_credit` a CLABE virtual | R2P SPEI con CLABE dinámica (`r2p_spei_credit`) |
| Payout SPEI | Unitario desde el Balance de JPay | Unitario y masivo desde el Balance del comercio; titular `matched` |
| Rebotes | No se reintegra un rebote posterior a `completed` | `spei_rejected` / `spei_return` se reintegran |
| USD | No existe | Cruce, traslado Global→USA, Fedwire y SWIFT |
| Credenciales | Una instancia | Matriz + instancia propia del comercio |
| Webhooks | `money_movements.*`, `accounts.balance.*` | + `cross_border_*`, `bulk_*`, `subclient.*`; suscripción por API |

Se reutiliza: cliente HTTP (token al 95%, 401, errores, firma), simulador, webhook con
deduplicación, transferencias SPEI con reserva e idempotencia, verificación de titular,
aprobación por monto, conciliación por identificadores, alertas y tarjetas del admin.

## 3. Decisiones

- **Modelo de fondos (cerrada por Cobre):** Subcliente + Balance por comercio.
- **Subcuentas (usuario, 2026-10-28):** un Balance por comercio. Su CLABE es la de la subcuenta
  principal; las demás subcuentas son saldos internos de JPay que se fondean y pagan desde el
  Balance del comercio.
- **PayIn (usuario):** se ofrecen los dos, el SPEI de Ecart Pay y el R2P de Cobre, y se documenta
  la comparación (`docs/COMPARATIVA_SPEI_ECARTPAY_COBRE.md`) para decidir después.
- **USD (usuario):** lo decide el comercio desde el portal (cotiza, convierte y paga), con
  aprobación de admin sobre un monto. JPay hace el traslado Global→USA automáticamente antes de
  cada pago.
- Aprobación doble sobre un monto (de C4) se mantiene; el `checker_approval` de Cobre queda apagado.

## 4. Datos técnicos clave (del documento)

- Base `https://api.cobre.co/v1`. `POST /auth` → token de 1200 s; renovar al 95%.
- Montos en centavos (MXN y USD).
- `POST /money_movements` y `POST /cross_border_money_movements` exigen el encabezado
  `idempotency` (≥ 9 caracteres, 24 h). Mismo valor + mismo cuerpo = mismo movimiento; mismo valor
  + otro cuerpo = 409. **Se guarda `(external_id, idempotency)` antes de llamar** y se reusa en
  todo reintento; nunca uno nuevo. Ante un timeout se consulta por `external_id` antes de recrear.
- `POST /subclients` usa otro encabezado: `Idempotency-Key` (≥ 9, 24 h).
- Cotización `static_quote`: vale 25 s; el Balance MX debe tener el monto antes; par on-market de
  05:00 a 16:00 (UTC−5). Una cotización vencida es una solicitud nueva, nunca un reintento.
- Fedwire y SWIFT: mínimo 1.00 USD; la contraparte `business` debe estar verificada antes de
  pagar. SWIFT termina en `completed` o `failed` (en `failed` el USD vuelve al Balance USA).
- Estados de Money Movement: `initiated`, `processing`, `pending_approval`, `completed`,
  `canceled`, `failed`, `rejected`. Cross Border: `initiated`, `processing`, `completed`,
  `rejected` (+ `failed` con static quote sin fondos). Nunca avanzar con un evento no terminal.
- Webhook `{ id, event_key, created_at, content }`, firmado con `event-timestamp` y
  `event-signature` (HMAC-SHA256 de `timestamp.cuerpo crudo`). Cobre reintenta solo errores de
  conexión (3 veces), nunca un 4xx: lo que se pierde lo recupera la conciliación diaria.
- Conciliación por identificadores (`external_id`, `money_movement_id`, `batch_id`), nunca por
  monto y hora.

## 5. Fases

### D0 — Base común
- Ruteo de eventos por familia (`money_movements`, `accounts.balance`, `subclient`,
  `cross_border_money_movements`, `bulk_money_movements`); tipos de transacción nuevos; motivos de
  rechazo completos; firma con timestamp reciente.
- Multi-instancia en `conexionCobre` (matriz o instancia del comercio) y webhook por instancia.
- Suscripción por API con todos los eventos del documento.
- Se retira el modelo `centralizado` y las CLABEs virtuales de la interfaz; se limpian los datos
  simulados de C1–C5.

### D1 — Alta del comercio: Subcliente y Balance
- Datos KYB que faltan: sitio web, industria, país de constitución y de operación,
  representantes legales y beneficiarios finales (UBOs). El onboarding de persona moral pasa a
  guardar al representante. Formularios en el admin y en el portal.
- `cobre-subclientes`: validar datos, crear (`POST /subclients`), consultar; aviso
  `subclient.status.*` y consulta periódica como respaldo.
- Al aprobarse: `POST /accounts` con `subclient_id`; la CLABE del Balance queda en la subcuenta
  principal. Balances Global y USA de la matriz, una vez, desde el admin.

### D2 — Payouts SPEI unitario y masivo
- Origen: el Balance del comercio. Solo se paga a titular `matched`.
- Rebotes posteriores a `completed` (`spei_rejected`, `spei_return`): estado `devuelta` y reintegro.
- Lotes: carga de archivo en el portal → `POST /bulk_money_movements`; cada ítem se sigue por su
  propio estado (`batch_id`).

### D3 — PayIn Direct Link R2P SPEI
- `cobre-r2p`: contraparte `r2p_spei` del pagador → Money Movement `r2p_spei` hacia el Balance del
  comercio → CLABE dinámica y vencimiento. Se acredita con `completed` + `r2p_spei_credit`.
- En el checkout del link (junto a Ecart Pay) y en el portal ("Solicitar pago por SPEI").
- Comparativa Ecart Pay vs Cobre para decidir cuál queda.

### D4 — USD: saldo y conversión
- El ledger admite USD; subcuenta USD por comercio; cuentas contables de los Balances Global y USA.
- `cobre-fx`: cotizar y convertir; acreditación al `completed` del cruce.
- Portal "Dólares": saldos, cotización con cuenta regresiva, horario de mercado y comisión.

### D5 — Payouts USD: Fedwire y SWIFT
- Destinatarios `business` (ABA para Fedwire, BIC para SWIFT) con verificación.
- Envío: reserva USD → traslado `global_pay_to_usa` → `fedwire` o `swift` → resultado final.

### D6 — Instancia Cobre propia del comercio
- Credenciales en Vault por comercio; todas las funciones resuelven la instancia; webhook y
  conciliación por instancia.

### D7 — Conciliación, reportes y alertas
- Conciliación por Balance (cada comercio contra su saldo en JPay; Global y USA contra USD).
- Alertas: subcliente trabado, Balance no conectado, cruce o traslado sin terminar, payout USD
  trabado, contraparte sin verificar.

### D8 — Instancia de prueba y certificación
- Credenciales de la instancia de prueba (las entrega el KAM) → `COBRE_MODO=prueba` → lista de
  pruebas → certificación (cuestionario + demo).
- Prerrequisitos que Cobre debe habilitar: Named Accounts/Subclientes, Balances Global y USA, par
  MXN/USD con static quote, Fedwire y SWIFT.
- Preguntas para Cobre: catálogo de `industry`, acrónimo de `short_name` (máx. 40 en total), alta
  de persona física como Subcliente, cupo de Balances por comercio, si siguen disponibles las
  CLABEs virtuales.

## 6. Lista de pruebas (simulador primero, después instancia de Cobre)

| # | Escenario | Esperado |
| --- | --- | --- |
| 1 | Token y renovación | Un solo token por 19 min; 401 → renueva y reintenta una vez |
| 2 | Alta de Subcliente aprobada | `approved` → Balance creado y CLABE en la subcuenta principal |
| 3 | Subcliente rechazado | Motivo visible; se corrige y se crea un registro nuevo |
| 4 | Webhook con firma inválida o vieja | 401 y registrado |
| 5 | Webhook duplicado | Se procesa una vez |
| 6 | R2P pagado | CLABE dinámica → `completed` → saldo acreditado una vez |
| 7 | R2P vencido (F003/R017) | Se puede emitir uno nuevo; nada acreditado |
| 8 | SPEI unitario completado | Pendiente → acreditada |
| 9 | SPEI rechazado (R005) | Reintegra saldo y comisión, motivo claro |
| 10 | Rebote después de `completed` | `devuelta` y reintegro una sola vez |
| 11 | Fondos insuficientes (F002) | No debita al cliente; alerta en admin |
| 12 | Reintento con la misma clave | Un solo movimiento (idempotencia) |
| 13 | Titular `unmatched` / `unresolved` | No permite pagar |
| 14 | Lote con ítems mixtos | Cada ítem con su estado; reintegro de los fallidos |
| 15 | Cruce MXN→USD | Cotización vigente → `completed` → saldo USD acreditado |
| 16 | Cruce con cotización vencida | Se pide otra; nunca se reintenta el movimiento |
| 17 | Traslado + Fedwire | Traslado `completed` → Fedwire `completed` |
| 18 | SWIFT fallido | `failed` → USD reintegrado al comercio |
| 19 | Contraparte USD sin verificar | No permite pagar |
| 20 | Instancia propia del comercio | Usa sus credenciales y su clave de webhook |
| 21 | Conciliación | Sin diferencias; una diferencia forzada aparece una vez |
| 22 | Argentina sigue igual | Transferencias AR sin cambios |

## 7. Estado (2026-10-28)

- **C1–C5 (rama `feature/cobre-c1`):** base, simulador, cuentas, depósitos, transferencias SPEI,
  conciliación, devoluciones y alertas con el modelo anterior.
- **D0–D7 (rama `feature/cobre-sd`, sobre `feature/cobre-c1`, sin push): hechas con el simulador.**
  - Migraciones 1037 (instancias, KYB, Subclientes, Balances por comercio/Global/USA, depósitos
    por Balance), 1038 (rebotes, lotes, R2P, USD, conversiones) y 1039 (ajustes y saldo esperado
    por comercio). Aplicadas.
  - Funciones: `cobre-subclientes`, `cobre-r2p`, `cobre-fx`, `cobre-instancias` (nuevas);
    `cobre-webhook`, `cobre-cuentas`, `cobre-transferencias`, `cobre-pendientes`,
    `cobre-conciliacion`, `cobre-simulador`, `crear-cliente` (cambiadas). Desplegadas.
  - Portal: Transferencias SPEI (CLABE del comercio, envío, lote), Cobrar por SPEI, Dólares,
    "Cuenta en Cobre" en Mi cuenta, SPEI de Cobre en el checkout del link.
  - Admin: tarjeta Cobre (Balances Global/USA, suscripción, aprobaciones de envíos y lotes,
    depósitos sin asignar, simulador) y pestaña "Cobre (México)" en el cliente (KYB, alta,
    instancia propia).
  - Se retiraron el modelo centralizado y las CLABEs virtuales; se limpiaron los datos simulados
    de C1–C5 (con contra-asientos).
- **Probado de punta a punta con el simulador (empresa MX de prueba):** alta KYB aprobada →
  Balance y CLABE; depósito acreditado; SPEI con titular sin verificar bloqueado; verificación
  `matched`; SPEI completado; rebote posterior a `completed` → `devuelta` con reintegro; reintento
  con el mismo TXID devuelve el mismo envío; lote de 2 pagos completado; cobro R2P pagado y
  acreditado; cotización y conversión de $500 a 27 USD; Fedwire completado tras el traslado
  Global→USA; SWIFT fallido con el saldo liberado; conciliación sin diferencias (Balance del
  comercio 4.492 = 4.492; dólares 22 = 22). 41 tests del cliente y del simulador.
- **Pendiente:** D8 (instancia de prueba de Cobre y certificación). La instancia propia de un
  comercio está construida pero sin probar contra Cobre real.
- **Decisiones del 2026-10-28 (segunda ronda):**
  - Comisiones de JPay en el modelo por comercio: se acuerdan aparte entre Cobre y JPay (fuera
    de este plan).
  - Montos de aprobación: configurables en el admin (País y proveedores → Cobre), en pesos y en
    dólares; vacío = sin aprobación.
  - SPEI en el link de pago: conviven Ecart Pay y Cobre; después se quita uno
    (`docs/COMPARATIVA_SPEI_ECARTPAY_COBRE.md`).
  - Reglas de prevención por país (migración 1040): México con sus propios valores, en pesos
    mexicanos, UMA mensual 2026 ($3,566.22, INEGI) en lugar del salario mínimo argentino y hora
    del centro. Se editan en el admin (Alertas → Parámetros de alertas / de bloqueos, selector de
    país). Los valores iniciales son una propuesta para que los valide el oficial de cumplimiento.
- **Pendiente de negocio:** si ante un rebote se devuelve también la comisión (hoy sí); las
  conversiones a dólares no pasan por las reglas ni cobran comisión de JPay.
- **Preguntas para Cobre (KAM):** catálogo de `industry`; el OAS de `/subclients` lista `id_type`
  de Colombia (cc, nit…) y el documento usa `rfc`: confirmar para México; acrónimo de
  `short_name`; alta de persona física como Subcliente; cupo de Balances por comercio; barrido
  de comisiones; costos de R2P, cruce y payouts USD.
