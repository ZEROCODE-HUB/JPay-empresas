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

- [ ] **Varios comercios por cliente** (por ahora cada cliente tiene uno): Conexiones los maneja
      por separado, pero Cobros con tarjeta, Suscripciones, Puntos físicos y Retiros operan solo
      el primer comercio (`RequiereEcartPay`). Agregar el selector si algún cliente usa varios.
- [ ] **Cobro en terminal**: Ecart Pay no publica la API para mandar un cobro a una terminal ni
      para asignar terminales desde la plataforma; hay que pedírsela.
- [ ] **Dólares**: el código está, pero no opera. Faltan los Balances Global y USA en la cuenta
      Cobre de la plataforma (`cobre_configuracion.cuenta_global_id` y `cuenta_usa_id` están
      vacíos): pedírselos a Cobre (sección 9) y cargarlos en el admin. Con una instancia Cobre
      propia del cliente los dólares no funcionan.
- [x] **Barrido de comisiones** (1073, 26/11/2026): admin → Integraciones → «Cobre: barrido de
      comisiones». Modos desactivado / al confirmarse cada envío / diario, monto mínimo y hora.
      Subcliente: movimiento interno al Balance de comisiones (crear o vincular desde esa tarjeta).
      Cuenta propia: SPEI a la CLABE de la plataforma (opcional). **Falta probar con $1 en Cobre real**
      el movimiento entre dos Balances MX (la doc pública no lo detalla; se usa el mismo cuerpo que
      el traslado Global→USA) y crear la cuenta de comisiones.

## 3. Seguridad y limpieza

- [ ] **Código por correo apagado**: `cobre_configuracion.exigir_otp` está en `false` y
      `monto_aprobacion` vacío: hoy ningún envío pide código ni aprobación. Prenderlos en el admin
      después de cargar Resend.
- [ ] **Código OTP en modo demo**: sin clave de Resend, `enviar-otp-transferencia` devuelve el
      código en la respuesta (el segundo factor no protege). Se resuelve al cargar Resend.
- [ ] **Tablas heredadas**: sin acceso para clientes desde 1070, pero siguen en la base (las
      migraciones son aditivas). Columnas heredadas como `comision_molipay*` siguen en uso por
      funciones viejas.
- [ ] **Auditoría periódica**: repetir las consultas de `docs/OPERACION.md` (sección 7) cada vez
      que se agreguen tablas, vistas o funciones `SECURITY DEFINER`.

## Resuelto (para referencia)

- 26/11/2026 (3.ª) — Personas del KYB congeladas para el cliente al enviar o aprobar su alta (1075).
  Destinatarios SPEI: si la cuenta de Cobre no tiene la verificación de titular (G005) quedan
  «Titular sin verificar» (`no_disponible`) y se puede transferir; se reintenta cada 24 h (1074).
  Al registrarse el usuario entra con sesión iniciada (Auth confirma el correo; la verificación la
  lleva `clientes.email_verificado`).

- 26/11/2026 (2.ª ronda) — Links de pago con código del servidor y búsqueda exacta (antes un
  cliente podía quedarse con los pagos de otro link) y alta en una transacción (1069); cobros
  masivos todo o nada (1069); confirmación antes de cada envío SPEI, lote y dólares; avisos de
  domiciliación verificados contra la orden; registro y reenvío sin revelar qué correos tienen
  cuenta; el cliente ya no puede aprobarse solo, subirse límites ni cambiar la moneda de una
  subcuenta (1071); KYC solo lectura para el cliente y `doc-url` limitado a su carpeta (1072);
  exportaciones CSV sin fórmulas; tablas heredadas sin acceso (1070); se quitaron Pago de
  servicios (portal) y Total de fondos / Bloqueo de funciones (admin, mostraban datos falsos).

- 26/11/2026 — OTP atómico (1068); TXID repetido en paralelo; envíos sin configuración; avisos
  de una instancia Cobre propia aislados; OAuth no reasigna cuentas; `/app` exige sesión; Salir
  cierra sesión; reintento tras corte de red no duplica transferencias.

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
