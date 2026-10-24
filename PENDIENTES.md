# Pendientes

Problemas conocidos del código que hay que resolver **antes de poner la plataforma en producción**.
Ordenados por prioridad. Ver también `PENDIENTES.md` en `JPay-admin`.

## 1. CRÍTICO — Edge Functions sin control de acceso

- **`crear-cliente`** (`supabase/functions/crear-cliente`): usa la service role y no verifica
  quién la llama. Si ya existe un cliente con el email recibido, **actualiza sus datos**: alcanza
  con conocer el email de alguien para modificar su legajo.
- **`crear-admin`** (en `JPay-admin`): ver ese repo; permite crear administradores sin verificar
  al llamador.

**Qué hacer**
- [ ] Exigir y validar el JWT del llamador en cada función (`auth.getUser(token)`), y en las de
      administración verificar su rol en la base antes de operar.
- [ ] En el alta de clientes, no permitir que una llamada anónima modifique un cliente existente.
- [ ] Revisar `verify_jwt` de cada función al desplegar.

> Las funciones de prueba que exponían documentos de identidad (`turl`, `test-sign`, `cleanup`)
> se eliminaron de este repo.

## 2. ALTO — Admin determinado por dominio de email (debe ser por rol)

`supabase/functions/doc-url/index.ts` decide si un usuario es administrador por el dominio de su
email (`brand.web.domain`). Ser admin **no puede depender del email**: cualquiera con una cuenta
de ese dominio quedaría como admin.

**Qué hacer**
- [ ] Definir el rol en la base (tabla de administradores con rol, o `app_metadata.role`
      asignado solo desde el backend con service role), nunca editable por el propio usuario.
- [ ] En `doc-url`, reemplazar el chequeo por dominio por un chequeo de ese rol.
- [ ] Revisar que las políticas RLS de administración usen el mismo rol.

## 3. MEDIO — ID de transferencia generado en el navegador

`src/routes/app.transferencias.tsx` arma el ID que se envía al Banco de Comercio en el navegador
(`TRF${Date.now()}`).

**Qué hacer**
- [ ] Generar el ID en el backend, con un prefijo configurable.
- [ ] No usar `Date.now()` como única fuente de unicidad (dos transferencias en el mismo
      milisegundo chocan).

## 4. MEDIO — Nombres heredados en columnas de la base

Algunas columnas y campos de la base todavía tienen nombres heredados: `tasa_molipay_pct`,
`tasa_molipay_monto`, `comision_molipay`, `comision_molipay_monto`, `comision_molipay_base`.
El código los lee y escribe tal cual porque deben coincidir con la base.

**Qué hacer**
- [ ] Migración de base que renombre esas columnas (y las funciones/vistas que las devuelven) a
      nombres neutros (p. ej. `tasa_plataforma_pct`), y actualizar el código en el mismo cambio.

## 5. Configuración obligatoria

- [ ] `VITE_PAYMENTS_API_URL`, `VITE_BDC_BACKEND_URL` y `VITE_PUBLIC_APP_URL` (ver `.env.example`).
      Sin `VITE_BDC_BACKEND_URL`, las transferencias por el banco quedan deshabilitadas.
- [ ] Reemplazar los datos ficticios de `src/brand/brand.json` (ver `BRANDING.md`).
