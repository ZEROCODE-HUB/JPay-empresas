# Cobro por SPEI: Ecart Pay vs. Cobre (R2P)

Fecha: 2026-10-28. Estado: **conviven los dos** en el checkout del link de pago (decisión del
2026-10-28: ofrecer ambos y decidir después cuál queda). Este documento junta lo necesario para
esa decisión.

## Cómo funciona cada uno hoy en JPay

| | Ecart Pay (SPEI de la orden) | Cobre (Direct Link R2P SPEI) |
| --- | --- | --- |
| Dónde se ofrece | Checkout del link (`EcartPayPagoCard`, método "Transferencia SPEI") | Checkout del link (`CobreSpeiPagoCard`) y portal: **Cobrar por SPEI** (`/app/cobrar-spei`) |
| Qué recibe el pagador | Una referencia/CLABE de la orden de Ecart Pay | Una CLABE dinámica de un solo uso, por el monto exacto, con vencimiento (30 min a 3 días) |
| Datos que pide al pagador | Nombre y correo | Nombre, **RFC o CURP** y correo (opcional) |
| Dónde queda el dinero | En la cuenta del comercio **en Ecart Pay** (modelo directo: no pasa por el ledger de JPay) | En el **Cobre Balance del comercio**, y se acredita en su subcuenta de JPay (ledger) |
| Cómo se confirma | Aviso de Ecart Pay + consulta de la orden | Aviso `money_movements.status.completed` + crédito `r2p_spei_credit` (por `mm_external_id`) |
| Conciliación | `ecartpay-conciliacion` (transacciones de cada comercio) | `cobre-conciliacion` (por Balance; recupera créditos sin aviso) |
| Después del cobro | El comercio retira desde Ecart Pay (`/app/retiros`) | El saldo queda en JPay: SPEI saliente, lote, conversión a dólares |
| Comisión de JPay | La que configure el comercio en Ecart Pay (fuera del ledger) | La regla de comisión de depósitos del ledger (`calcular_comision`) |
| Vencido o abandonado | Orden vencida | `rejected` con F003 / R017 (se emite otro); R012, R016, R019–R021 también permiten reintentar |
| Alta del comercio | Conectar su cuenta de Ecart Pay (OAuth) | Subcliente aprobado (KYB) + Cobre Balance |

## Criterios para decidir

1. **Dónde tiene que estar el dinero.** Si el comercio va a transferir, pagar en lote o convertir
   a dólares desde JPay, Cobre lo deja ya en su Balance y en el ledger. Con Ecart Pay hay que
   retirarlo primero.
2. **Fricción del pagador.** Ecart Pay pide menos datos. Cobre exige RFC/CURP del pagador para la
   contraparte `r2p_spei`.
3. **Costo.** Comparar la comisión de Ecart Pay por SPEI con la de Cobre por R2P (no sale de la API;
   lo da el KAM) y la comisión que cobra JPay en cada caso.
4. **Una sola conciliación.** Con Cobre, cobros y pagos del comercio se concilian en el mismo
   Balance.
5. **Dependencia de cada proveedor.** Tarjeta y OXXO siguen siendo de Ecart Pay; si el SPEI pasa a
   Cobre, Ecart Pay queda solo para esos métodos.

## Qué medir mientras conviven

- Cobros iniciados vs. pagados por proveedor (`pagos.proveedor`, `pagos.estado`).
- Tiempo hasta el pago (de `created_at` a `pagado_at`).
- Abandonos y vencimientos (Cobre: `cobre_cobros_r2p.estado` = `vencido`; Ecart Pay: órdenes vencidas).
- Incidencias de conciliación por proveedor (`conciliacion_proveedor_diferencias`).

## Cómo quitar uno

- **Quitar Ecart Pay SPEI:** sacar `spei` de `METODOS` en `EcartPayPagoCard.tsx` (tarjeta y OXXO quedan).
- **Quitar Cobre R2P del checkout:** no mostrar `CobreSpeiPagoCard` en `src/routes/p.$code.tsx`
  (el cobro desde el portal puede quedar).
