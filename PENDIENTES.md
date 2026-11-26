# Pendientes

Lo que falta resolver **antes de operar con clientes reales**, ordenado por prioridad. Cómo está
armado todo (conexiones, correo, funciones, seguridad): `docs/OPERACION.md`. Ver también
`PENDIENTES.md` en `JPay-admin`.

Última revisión: 26/11/2026.

## 1. Configuración que solo puede hacer el equipo

- [ ] **Correo (Resend)**: cargar la clave en el admin (Sistema › Integraciones › Correo), verificar
      el dominio en Resend, poner el remitente y el buzón que recibe las solicitudes, y mandar la
      prueba. Mientras no esté, el correo está en **modo demo**: el enlace de verificación y el
      código de las transferencias se muestran en pantalla, así que la verificación no protege nada.
- [ ] **Datos de la marca**: `src/brand/brand.json` todavía tiene razón social, RFC, domicilio,
      correos y dominios de ejemplo (`jpay.example`). Ver `BRANDING.md`.
- [ ] **Cobre en producción**: hoy se opera el espacio productivo de pruebas con una cuenta propia
      conectada. Falta acordar con Cobre lo de la sección 9 del Solution Design (habilitaciones) y
      pasar `COBRE_MODO` a `produccion` con las credenciales definitivas.
- [ ] **Ecart Pay en producción**: activar la pasarela de la cuenta, pasar el proveedor de sandbox
      a producción y volver a vincular los comercios.
- [ ] **Simulador apagado**: `parametros_globales.simulador_depositos_habilitado` debe quedar en
      `false` y conviene desprogramar la tarea `cobre-simulador` de pg_cron.

## 2. Funcionalidad

- [ ] **Varios comercios por cliente**: Conexiones los maneja por separado, pero Cobros con
      tarjeta, Suscripciones, Puntos físicos y Retiros operan solo el primer comercio
      (`RequiereEcartPay`). Agregar el selector de comercio si se van a usar varios.
- [ ] **Cobro en terminal**: Ecart Pay no publica la API para mandar un cobro a una terminal ni
      para asignar terminales desde la plataforma; hay que pedírsela.
- [ ] **Dólares con cuenta Cobre propia**: los envíos y conversiones en USD solo funcionan con la
      cuenta de la plataforma (Balances Global y USA).
- [ ] **Barrido de comisiones**: las comisiones de la plataforma quedan en el Balance del cliente
      en Cobre; falta definir cómo se cobran.
- [ ] **Pago de servicios**: la pantalla existe pero no tiene backend (módulo apagado).

## 3. Seguridad y limpieza

- [ ] **`reenviar-verificacion` y el registro revelan si un correo tiene cuenta** (mensaje distinto
      cuando no existe). Riesgo bajo; decidir si se unifica el mensaje.
- [ ] **Tablas y columnas heredadas** sin uso en México (`caja_molipay`, `liquidaciones_*`,
      `lotes_*`, `comision_molipay*`, parámetros como `iva_sobre_comision_pct`): están cerradas por
      RLS, pero conviene retirarlas o renombrarlas con una migración aparte.
- [ ] **Auditoría periódica**: repetir las consultas de `docs/OPERACION.md` (sección 7) cada vez
      que se agreguen tablas, vistas o funciones `SECURITY DEFINER`.

## Resuelto (para referencia)

- 26/11/2026 — `crear-cliente` exige sesión y usa el correo de la sesión (antes cualquiera podía
  reescribir los datos de un cliente conociendo su correo).
- 26/11/2026 — `doc-url` decide quién es administrador por rol en la base, no por el dominio del
  correo.
- 26/11/2026 — Migración 1066: políticas abiertas heredadas, vistas sin `security_invoker` y
  buckets `kyc` y `conciliaciones`.
- 26/11/2026 — Las funciones públicas (avisos, OAuth, tareas programadas) volvieron a ser públicas
  y quedaron fijadas en `supabase/config.toml` (`npm run functions:check`).
- 26/11/2026 — La conciliación de Cobre funciona contra la API real.
- 11/2026 — Controles en funciones `SECURITY DEFINER` (1017, 1018, 1055) y RLS de `comercios` (1063).
