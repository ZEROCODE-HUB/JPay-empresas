# Sincronizar con MoliPay

JPay nació como copia con rebranding del repo original de MoliPay, que se sigue desarrollando.
Para traer sus cambios nuevos:

```bash
npm run sync:upstream -- --dry-run   # lista los commits pendientes, no toca nada
npm run sync:upstream                # los aplica en una rama sync/molipay-AAAA-MM-DD
```

El origen y el último commit sincronizado están en `.upstream-sync.json`. El script nunca trabaja
sobre `main` ni hace push: el resultado queda en la rama de sync para revisarlo y recién después
mergearlo (Vercel despliega `main`).

## Qué hace solo

- `cherry-pick -x` de cada commit nuevo, en orden. Los ya aplicados (trailer
  `cherry picked from commit …`) se saltean, así que se puede volver a correr tras un conflicto.
- `bun.lock`: se descarta (JPay usa npm) y `package-lock.json` se regenera con `npm install`.
- Al final actualiza `.upstream-sync.json` y corre `npm run brand:check`.

## Conflictos: cómo resolverlos

Casi siempre son bloques que MoliPay reescribió y donde JPay solo había cambiado la marca.
Regla: **tomar la lógica nueva de MoliPay y volver a aplicar la marca de JPay.**

| En MoliPay                                                                      | En JPay                                            |
| ------------------------------------------------------------------------------- | -------------------------------------------------- |
| `MoliPay`, `Molipay`, `Molly`, `MoliPlay` en textos                             | `brand.name` / `brand.shortName` (`@/brand/brand`) |
| Títulos de página escritos a mano (`"… — Admin Molly"`)                         | `pageTitle("…")`                                   |
| `red-*` (era el color de marca)                                                 | `danger-*` para errores y alertas                  |
| `text-primary` como color de texto                                              | `text-primary-ink`                                 |
| `text-white` sobre fondo de marca                                               | `text-primary-foreground`                          |
| Prefijo `MOLI` en `originId` de BDC                                             | `TRF`                                              |
| Imports de `@/brand/brand` o `@/brand/colors` que se pierden al tomar un bloque | volver a agregarlos                                |

Lo propio de JPay que no existe en MoliPay se conserva (p. ej. el modo demo de verificación sin
Resend en el portal empresas).

Las columnas de la base con `molipay` en el nombre (`tasa_molipay_pct`, `comision_molipay`, …)
son correctas: renombrarlas requiere una migración.

## Antes de mergear a main

1. `npm run brand:check` sin problemas (detecta los nombres de `previousNames` en `brand.json`).
2. `npx tsc --noEmit -p .`: no debe haber errores nuevos respecto de `main`.
3. `npx vite build` sin errores.
4. Si el código nuevo llama funciones o tablas nuevas (`rpc(…)`, `.from(…)`), confirmar que
   existan en el Supabase de JPay; si no, aplicar la migración correspondiente.
5. Probar en local las pantallas tocadas.
