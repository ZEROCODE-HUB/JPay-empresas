# Arquitectura de Links de Pago y Checkout Público (HPP)

> Handoff para el desarrollador que continúa. Última actualización: sesión de implementación de JPay Empresas.
> Repos involucrados:
>
> - **el portal de empresas** (app del portal + checkout público)
> - **el panel de administración** (migraciones de DB en `supabase/migrations/`)

---

## 1. Objetivo

El cliente empresarial genera **links de pago** desde el portal (`/app/link-pago/productos`). Cada link lleva a una
**página de checkout pública e independiente** (Hosted Payment Page, HPP) donde un pagador anónimo puede abonar con
los métodos habilitados y branding JPay. Hoy el pago es **simulado**, pero la arquitectura deja la puerta abierta
para enchufar un PSP real sin tocar la UI.

---

## 2. Modelo de datos (Supabase)

### `productos` (catálogo por cliente) — migration `0013`

- `id uuid`, `cliente_legajo fk`, `nombre`, `descripcion`, `precio numeric`, `cantidad int`, `moneda`, `sku`, `imagen_url`, `activo`, `created_at`.
- Dueño = el cliente (`cliente_legajo`). `cliente_legajo` nulo = catálogo global futuro.

### `cliente_links_pago` (link) — migration `0013` (EXTIENDE la tabla existente, no la reemplaza)

- Existentes: `id, cliente_legajo, comercio_nombre, url, monto, estado, created_at`.
- Nuevas columnas: `referencia, notas, expira_en timestamptz, pagos_parciales bool, metodos_pago jsonb, vistas int, pagos int`.
- `url` = string de branding `https://pay.jpay.example/l/{CODE}` (ver sección 5).
- `estado` ∈ {Activo, Inactivo, Vencido}. `metodos_pago` = array de ids (ver `paymentMethods` en `src/data/links-pago.ts`).
- `monto` = total desnormalizado (snapshot).

### `cliente_links_pago_detalle` (relación N:N link↔producto) — migration `0013`

- `id, link_id fk, producto_id fk (on delete set null), producto_nombre (snapshot), cantidad, precio_unitario, created_at`.
- Guarda snapshot del producto para que el link siga mostrando importes aunque se borre el producto.

### `cliente_links_pago_pagos` (intentos/confirmaciones) — migration `0015`

- `id, link_id fk, cliente_legajo, metodo, monto, estado ('Aprobado'), pagador_nombre, pagador_email, referencia, created_at`.
- Aquí es donde el PSP real (vía webhook) insertará la confirmación. Hoy lo llena el procesador simulado.

---

## 3. Seguridad / RLS (importante)

- Función `legajo_de_sesion()` (migration `0013`): mapea `auth.email()` → `clientes.legajo`. `SECURITY DEFINER`.
- Tablas `productos`, `cliente_links_pago`, `cliente_links_pago_detalle`, `cliente_integraciones_ecommerce`: políticas de **cliente**
  (`cliente_legajo = legajo_de_sesion()`) sin romper las de admin existentes.
- **El checkout público NO abre RLS de tablas al anónimo.** El pagador anónimo accede solo por 3 funciones `SECURITY DEFINER`
  con `grant execute to anon, authenticated` (migration `0015`):
  - `obtener_link_pago(p_codigo text) → jsonb`: devuelve **solo** ese link + su detalle (match `url like '%' || p_codigo`). Nunca expone datos de otros clientes.
  - `incrementar_vistas_link(p_link_id uuid)`: suma `vistas`.
  - `registrar_pago_link(...)`: inserta en `cliente_links_pago_pagos` y suma `pagos`.
- No crear políticas `select` públicas sobre `cliente_links_pago`/`detalle`. Si se necesita listar links en el portal, ya existe la política de cliente.

---

## 4. Flujo

### Generar link (portal, `src/routes/app.link-pago.productos.tsx`)

1. Usuario selecciona productos y configura métodos/parciales/expiración/referencia.
2. `insert` en `cliente_links_pago` (monto = Σ precio×cantidad) + `insert` en `cliente_links_pago_detalle` (uno por producto).
3. El `CODE` se genera en el front (`LP-XXXXXX`) y se compone la `url` de branding.

### Checkout público (`src/routes/p.$code.tsx`)

1. Carga por `obtener_link_pago(code)`.
2. Valida: inexistente → "no encontrado"; `estado='Inactivo'` → inactivo; `expira_en` < now → vencido.
3. `incrementar_vistas_link(id)` al abrir.
4. Muestra monto (de detalle), productos, métodos habilitados, y campo de monto si `pagos_parciales`.
5. Pago → `paymentProcessor.process(...)` → `registrar_pago_link` → pantalla de éxito.

---

## 5. URL de branding vs URL resoluble (leer bien)

- `cliente_links_pago.url` se guarda como `https://pay.jpay.example/l/{CODE}` por branding. **Ese subdominio hoy NO resuelve**
  a la app (no se configuró DNS). Es solo el string canónico.
- La ruta real de la app es **`/p/{CODE}`** dentro del dominio donde corre el despliegue.
- Para probar hoy: abrir `<origen-donde-corre-la-app>/p/{CODE}` (localhost o el deploy de Cloudflare).
- Para producción: desplegar este mismo repo en `pay.jpay.example` (deploy independiente, mismo repo) y el link queda funcional.
- **Pendiente decidir**: si el botón "Copiar link" debe copiar la URL resolvable (`<origen>/p/{CODE}`) en lugar del branding, para que funcione antes de configurar el DNS.

---

## 6. Abstracción del procesador (pluggable a PSP real)

`src/lib/payment-processor.ts`:

- Interfaz `PaymentProcessor { process(req): Promise<PaymentResult> }`.
- `SimulatedProcessor` (actual): llama `registrar_pago_link` y devuelve aprobado.
- `export const paymentProcessor` es la instancia usada por el checkout.
- **Para PSP real**: crear `PspProcessor implements PaymentProcessor` que hable con la pasarela (tokenización, cobro) y confirme
  vía webhook insertando en `cliente_links_pago_pagos` (con `estado` real). Luego cambiar la línea de export. La UI no cambia.

---

## 7. Cómo probar en un entorno

1. Aplicar en Supabase las migrations (orden): `0013`, `0014`, `0015`.
2. Redeploy de el portal de empresas con el commit que incluye `/p/$code` (ruta generada en `src/routeTree.gen.ts`).
3. Desde el portal generar un link y abrir `<origen-app>/p/{CODE}`.

---

## 8. TODO / siguientes pasos para el próximo dev

- [ ] Configurar DNS/subdominio `pay.jpay.example` → deploy de la app (mismo repo, superficie pública aislada).
- [ ] Decidir si `url` guardada apunta al origen real o se mantiene el branding (y ajustar "Copiar link").
- [ ] Implementar `PspProcessor` real + endpoint/webhook que confirme en `cliente_links_pago_pagos`.
- [ ] PCI: el formulario de tarjeta hoy es UX simulada (no se envía a ningún PSP). Al integrar PSP, usar tokenización y no guardar PAN.
- [ ] Expiración automática: hoy se evalúa al abrir; opcional marcar `estado='Vencido'` con un job.
- [ ] Notificar al cliente dueño del link cuando se confirma un pago (email/Socket).

---

## 9. Archivos clave

el portal de empresas:

- `src/routes/app.link-pago.productos.tsx` — gestión de productos y generación de links (DB real).
- `src/routes/app.link-pago.dashboard.tsx` — métricas desde `movimientos` (tipo `tarjeta`) + links.
- `src/routes/app.link-pago.e-commerce.tsx` — integraciones e-commerce persistidas.
- `src/routes/p.$code.tsx` — **checkout público HPP** (branding JPay).
- `src/lib/payment-processor.ts` — abstracción del procesador de pago.
- `src/data/links-pago.ts` — catálogo de `paymentMethods` (ids usados en `metodos_pago`).

el panel de administración (`supabase/migrations`):

- `0013_productos_y_links_pago.sql` — productos, extensión de `cliente_links_pago`, detalle, RLS cliente.
- `0014_cliente_integraciones_ecommerce.sql` — integraciones e-commerce por cliente.
- `0015_checkout_links_pago.sql` — `cliente_links_pago_pagos` + funciones RPC públicas (`obtener_link_pago`, `incrementar_vistas_link`, `registrar_pago_link`).

---

## 10. Recomendación — Enlaces de Pago escalables y robustos (Lotes + Productos)

> Contexto: el fix de Lotes de 2026-08 reutiliza intencionalmente la lógica de Productos (`src/routes/app.link-pago.productos.tsx:195` → `src/data/cobros-masivos.ts:412` + `toResolvableLinkPagoUrl` `src/data/cobros-masivos.ts:105`) para cumplir restricción "no tocar Productos". Es correcto como parche, pero arrastra deuda que no escala. Esta sección define el target a implementar cuando se levante la restricción.

### 10.1 Problemas del modelo actual

- **URL hardcodeada y dual:** se guarda branding `https://pay.jpay.example/l/CODE` (`productos.tsx:196`, `cobros-masivos.ts:412`) y en UI se reconstruye resoluble `window.location.origin/p/CODE` (`p.$code.tsx:1`, `cobros-masivos.ts:111`). El string crudo de DB nunca resuelve sin DNS de `pay.jpay.example`; copias/exportes dependen de `window` (falla en SSR/email).
- **CODE no único:** `LP-` + `Math.random().toString(36)` en frontend. Para lotes con N=500 colisión no despreciable, sin `UNIQUE` ni retry.
- **Sin transacción, N+1:** `iniciarLoteDB` hace `insert cliente_links_pago` + loop `actualizar_link_registro` N veces + `insert detalle` (`cobros-masivos.ts:425-449`). Fallo parcial deja `lote_registros.link_de_pago` desincronizado.
- **Duplicación:** `lote_registros.link_de_pago text` copia la URL en vez de FK `link_id uuid → cliente_links_pago.id`; no hay integridad referencial.
- **Mapeo de medios disperso:** Lote guarda categorías `TRANSFERENCIA|TARJETA_CREDITO` y se inserta directo en `cliente_links_pago.metodos_pago`; la expansión a `visa-cred, mc-deb…` solo vive en `src/routes/p.$code.tsx:37` `LOTE_CATEGORY_TO_METHODS`.

### 10.2 Diseño objetivo

1. **Single source of truth para URLs.** Centralizar en `src/lib/pay-url.ts`:

   ```ts
   export const PAY_BRAND_BASE = import.meta.env.VITE_PAY_BRAND_BASE; // https://pay.jpay.example
   export const PAY_APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN; // https://tu-deploy.vercel.app
   export const buildBrandingUrl = (code: string) => `${PAY_BRAND_BASE}/l/${code}`;
   export const buildResolvableUrl = (code: string) => `${PAY_APP_ORIGIN}/p/${code}`;
   ```

   Guardar en DB `code text UNIQUE` + `url_branding` + `url_resoluble` generadas en backend (no en `window`). Email/export usan `url_resoluble`.

2. **Generación en backend, transaccional e idempotente.** Nueva RPC `crear_links_lote(p_lote_id uuid)` `SECURITY DEFINER` que:
   - valida `legajo_de_sesion() = lotes.cliente_legajo`,
   - genera `CODE` con `gen_random_uuid()` o secuencia `LP-` + `upper(substr(md5(random()::text),1,6))` con `UNIQUE` y retry,
   - `INSERT` batch en `cliente_links_pago` + `cliente_links_pago_detalle` + `UPDATE lote_registros SET link_id = ...` en una sola transacción, con `ON CONFLICT DO NOTHING` y retorno `linksCount`.

3. **FK en vez de copia.** Migrar `lote_registros.link_de_pago text` → `lote_registros.link_id uuid REFERENCES cliente_links_pago(id) ON DELETE SET NULL` + vista `lote_registros_con_url`. Mantener `url` solo para histórico/branding.

4. **Catálogo único de medios.** Definir tabla o `enum` `medio_pago_catalog` y función `expand_medios(categorias jsonb) → jsonb` usada tanto al crear (`cobros-masivos.ts`) como al renderizar (`p.$code.tsx`). Eliminar `LOTE_CATEGORY_TO_METHODS` duplicado.

5. **Seguridad.** Dejar de pasar `legajo` desde frontend (`getLegajoUsuario()` `cobros-masivos.ts:203`). La RPC debe derivar `legajo_de_sesion()` internamente.

6. **Observabilidad y lote masivo.** Batch insert (`UNNEST` o `jsonb_populate_recordset`), paginación y `pg_job`/cron para marcar `expira_en < now() → estado='Vencido'` sin evaluar solo en `p.$code.tsx:92`.

### 10.3 Plan de migración (sin romper Productos)

- Fase 1 (no breaking): crear `pay-url.ts` y hacer que `iniciarLoteDB` y `productos.tsx:generateLink` lo usen.
- Fase 2 (DB): agregar columnas `code`, `link_id`, `UNIQUE(code)`, backfill `code = split_part(url,'/',4)`.
- Fase 3 (RPC): implementar `crear_links_lote` y migrar `app.cobros.lote.$id.tsx` / `app.cobros.gestion.tsx` a usarla; deprecar loop cliente.
- Fase 4: cuando `pay.jpay.example` tenga DNS, decidir canónico único y dejar `url_branding` como alias.
