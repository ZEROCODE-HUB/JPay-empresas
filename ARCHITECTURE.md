# Arquitectura y convenciones

Este documento es igual en JPay-admin y JPay-empresas. Los dos repos son independientes
(cada uno despliega a su proyecto de Vercel) pero siguen la misma estructura y comparten
código a través de `src/shared/`.

## Estructura

```
src/
  routes/                 Definición de rutas (TanStack Router, por nombre de archivo).
                          Solo arman la pantalla: sin lógica de datos ni componentes grandes.
  features/<dominio>/<pantalla>/
    components/           Piezas de una pantalla (tabs, tablas, modales).
    hooks/                Estado de la pantalla (filtros, selección, formularios).
  components/             UI genérica sin reglas de negocio.
  shared/                 Código idéntico en los dos repos (ver "Código compartido").
  hooks/use<Dominio>.ts   react-query sobre lib/api.
  lib/api/<dominio>.ts    ÚNICO lugar que habla con Supabase (from/rpc/functions.invoke).
  lib/database.types.ts   Tipos generados del esquema real (`npm run gen:types`). No editar.
  brand/                  Marca: nombre, colores, logos (`npm run brand:sync`).
supabase/
  functions/<nombre>/     Edge Functions (Deno).
  functions/_shared/      http.ts (compartido entre repos), brand.ts (generado), email.ts.
```

## Reglas

- **Datos**: los componentes y rutas no llaman a Supabase. Leen con hooks `useX` (react-query)
  que llaman a `lib/api`. Las escrituras son `useMutation` que invalidan las queries afectadas.
- **Tipos**: las filas salen de `Tables<"tabla">`, `TablesInsert<"tabla">` y
  `TablesUpdate<"tabla">` de `database.types.ts`. Sin `any` nuevos (ESLint avisa).
- **Formato**: montos, números, porcentajes, fechas y CUIT siempre con `@/shared/format`
  (`formatMoney`, `formatDate`, …). Nada de `toLocaleString` sueltos ni helpers locales.
- **Tamaño**: archivos de `routes/` de menos de 300 líneas; componentes de menos de 400.
  Si una pantalla crece, se parte en `features/`.
- **Marca**: nunca escribir el nombre de la marca ni sus colores a mano; usar `brand` y los
  tokens de Tailwind (`npm run brand:check` lo verifica).

## Código compartido

`src/shared/`, los scripts de `scripts/` y `supabase/functions/_shared/http.ts` deben ser
idénticos en los dos repos. Se edita en uno y se copia al otro:

```bash
npm run shared:check            # verifica (busca el repo hermano en ../)
npm run shared:check -- --fix   # copia la versión de este repo al otro
```

## Verificación

Antes de commitear (CI corre lo mismo en cada push):

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run brand:check && npm run shared:check
```

Edge Functions: `npx deno@2.9.5 check supabase/functions/*/index.ts`.

## Relación con MoliPay

JPay nació como copia de MoliPay y desde el refactor de 2026-10 sigue su propio camino.
Los cambios nuevos de MoliPay se revisan con `npm run sync:upstream -- --dry-run` y se portan
a mano por funcionalidad (ver `SYNC_MOLIPAY.md`).
