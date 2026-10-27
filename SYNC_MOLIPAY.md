# Cambios de MoliPay

JPay nació como copia con rebranding del repo original de MoliPay, que se sigue desarrollando.
Desde el refactor de 2026-10 JPay tiene su propia estructura (`src/features/`, `src/lib/api/`,
`src/shared/`, ver `ARCHITECTURE.md`), así que los commits de MoliPay **ya no se aplican con
cherry-pick**: se revisan y se portan a mano por funcionalidad.

```bash
npm run sync:upstream                  # commits nuevos de MoliPay y archivos que tocan
npm run sync:upstream -- --diff <sha>  # diff completo de un commit
npm run sync:upstream -- --mark <sha>  # registra que se portó todo hasta ese commit
```

El origen y el último commit portado están en `.upstream-sync.json`. El script nunca modifica el
código.

## Cómo portar una funcionalidad

1. Entender qué cambia el commit (pantalla, consulta, RPC, migración).
2. Ubicar el equivalente en JPay: las consultas viven en `src/lib/api/<dominio>.ts`, las
   pantallas grandes en `src/features/<dominio>/<pantalla>/`, el formato en `@/shared/format`.
3. Aplicar la lógica nueva respetando la marca de JPay:

   | En MoliPay                                          | En JPay                                             |
   | --------------------------------------------------- | --------------------------------------------------- |
   | `MoliPay`, `Molipay`, `Molly`, `MoliPlay` en textos | `brand.name` / `brand.shortName` (`@/brand/brand`)  |
   | Títulos de página escritos a mano                   | `pageTitle("…")`                                    |
   | `red-*` (era el color de marca)                     | `danger-*` para errores y alertas                   |
   | `text-primary` como color de texto                  | `text-primary-ink`                                  |
   | Prefijo `MOLI` en `originId` de BDC                 | `TRF`                                               |
   | `toLocaleString` / helpers `fmt*`                   | `formatMoney`, `formatDate`, … de `@/shared/format` |
   | `supabase.from(...)` dentro de un componente        | función en `lib/api` + hook react-query             |

4. Si el commit trae migraciones SQL, aplicarlas en el Supabase de JPay y regenerar los tipos
   (`npm run gen:types`).
5. Verificar (`ARCHITECTURE.md` → Verificación) y registrar el avance con `--mark <sha>`.

Las columnas de la base con `molipay` en el nombre (`tasa_molipay_pct`, `comision_molipay`, …)
son correctas: renombrarlas requiere una migración.
