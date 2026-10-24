# Marca (branding)

La marca de la app (nombre, empresa, contactos, dominios, colores, tipografías y logos) vive en
**un solo lugar**: `src/brand/`. Ningún componente escribe la marca a mano; un verificador
(`npm run brand:check`) lo impide y corre en CI.

> Este archivo es igual en `JPay-empresas` y `JPay-admin`. `src/brand/brand.json` también debe
> ser idéntico en ambos repos.
>
> Identidad visual: *Manual de identidad y lineamientos gráficos JPay* (semifinal, 12/10/2026).

## Qué hay en `src/brand/`

| Archivo | Qué es | ¿Se edita? |
|---|---|---|
| `brand.json` | Nombre, razón social, CUIT, emails, dominios, tipografías y colores | **Sí: es la fuente de verdad** |
| `assets/` | Logos, imagen para redes (og:image), fondos e imágenes | **Sí: reemplazar archivos** |
| `brand.ts` | Expone `brand`, `pageTitle()`, `copyright()`, `mailto()` al código | Solo si cambia la lista de assets |
| `colors.ts` | `resolveColor()` para canvas/PDF (lee los colores del tema en runtime) | No |
| `brand.generated.css` | Variables `--brand-*` | **No: es generado** |

`supabase/functions/_shared/brand.ts` también es **generado** (las Edge Functions de Deno no pueden
importar archivos de `src/`).

## `brand.json`

| Campo | Para qué |
|---|---|
| `name`, `shortName`, `tagline`, `description`, `regulatoryNote` | Textos de marca en toda la UI, títulos de pestaña, correos |
| `previousNames` | *(opcional)* nombres anteriores de la marca: el verificador falla si alguno queda en el código |
| `company.*` | Razón social, nombre corto de la empresa, CUIT, país (textos legales, footer) |
| `contact.*`, `web.*`, `email.*` | Emails, dominios, links de pago, remitente de correos |
| `fonts.display` / `fonts.body` | Tipografía de títulos y de cuerpo; `displayWeight` = peso de los títulos |
| `fonts.stylesheets` | Hojas de estilo que cargan esas tipografías (se insertan en `<head>`) |
| `colors.primary` | Color principal: botones, acentos, links activos |
| `colors.primaryInk` | Tono del principal para **texto** sobre fondo claro: un paso (`"700"`) o un hex. Usar uno que dé contraste ≥ 4,5:1 sobre blanco |
| `colors.secondary` | Color institucional: foco, información, navegación activa |
| `colors.highlight` | Acento de apoyo: menú activo del portal, badges |
| `colors.neutral` | *(opcional)* tinte de los grises de la UI (textos, bordes). Sin él: grises neutros |
| `colors.navigation` | Fondo del menú lateral oscuro (si se omite: `secondary-800`) |
| `colors.surface` | *(opcional)* fondo de las pantallas. Sin él: el fondo neutro de cada app |
| `colors.onPrimary` / `onSecondary` / `onHighlight` | Color del texto sobre esos fondos (contraste) |

Cada escala de color va de `50` (más claro) a `900` (más oscuro); `500` es el color base. Si solo
hay algunos pasos, `brand:sync` deriva el resto (mezcla con blanco/negro en OKLab).

> **Datos ficticios:** la razón social, el CUIT, los emails y los dominios de `brand.json` son
> valores de ejemplo (dominio `.example`, reservado). Reemplazarlos por los reales antes de
> publicar la plataforma.

## Cómo cambiar la marca

1. Editar `src/brand/brand.json` (textos, contactos, tipografías y colores). Si cambia el nombre,
   agregar el anterior a `previousNames`.
2. Reemplazar en `src/brand/assets/` los logos (`logo.svg`, `logo-light.svg`, `isotipo.svg`)
   manteniendo el nombre. Si un SVG viene con lienzo grande, recortar su `viewBox` al contenido.
3. Correr `npm run brand:sync` (también corre solo antes de `dev` y `build`).
4. Regenerar las imágenes de marca: `npm run brand:assets` (necesita `sharp`; si no está:
   `npm i --no-save sharp`). Genera `hero.webp` y `og-image.png` con los colores y el logo.
   Si diseño entrega fotos o piezas definitivas, reemplazar esos archivos.
5. `npm run brand:check` y revisar visualmente las pantallas principales.
6. Repetir en el otro repo con el **mismo** `brand.json`.

### Assets

**Ambas apps** (`src/brand/assets/`)
- `logo.svg`: imagotipo para fondos claros.
- `logo-light.svg`: imagotipo en negativo (texto claro) para fondos oscuros.
- `isotipo.svg`: símbolo solo; se usa como favicon.
- `og-image.png` (1200×630) y `hero.webp` (2560×1440): generados con `npm run brand:assets`.

**Solo JPay-empresas**
- `landing-dashboard.png`: captura del panel que se muestra en la landing (conviene rehacerla
  con datos reales).
- `login-hero.jpg`: foto lateral de login/onboarding.

## Reglas para el código

- **Textos**: `import { brand, pageTitle } from "@/brand/brand"` → `brand.name`,
  `brand.company.legalName`, `brand.contact.support`, `pageTitle("Sección")`…
- **Logo**: siempre `<BrandLogo />`. Sobre fondos oscuros `variant="light"`. Mínimo 36 px de
  alto (manual: 116 × 36 px). No encerrarlo en recuadros, no aplicarle filtros ni sombras.
- **Colores de marca**: clases `primary-*`, `secondary-*`, `highlight-*`, `navigation` (o los
  tokens semánticos `primary`, `secondary`, `ring`, `sidebar-*`). En estilos inline/SVG:
  `var(--brand-primary-500)`. En canvas/jsPDF: `resolveColor("primary")`.
- **Texto en color de marca** sobre fondo claro: `text-primary-ink` (nunca `text-primary`). Sobre
  fondos oscuros, un paso claro explícito (`text-primary-300`/`400`).
- **Texto sobre color de marca**: `text-primary-foreground` / `text-highlight-foreground`, nunca
  `text-white` fijo (sobre Jade y Ámbar el texto va oscuro para cumplir contraste).
- **Errores**: `danger-*`, `destructive`, `error` (rojo fijo: no cambia con la marca).
- **Prohibido**: hex de la marca, clases `red-*` / `navy-*`, y el nombre o los dominios de la
  marca escritos a mano. `npm run brand:check` falla si aparecen.
- Excepciones legítimas (un identificador que no se puede cambiar): agregar el comentario
  `brand-check-ignore: <motivo>` en la misma línea.

## Configuración por entorno

Las URLs de infraestructura **no** están en el código ni en `brand.json`: se configuran con
variables de entorno (ver `.env.example`), p. ej. `VITE_PUBLIC_APP_URL`, `VITE_PAYMENTS_API_URL`
y `VITE_BDC_BACKEND_URL` en `JPay-empresas`.

## Fuera del código (checklist de lanzamiento)

- [ ] Reemplazar los **datos ficticios** de `brand.json`: razón social, CUIT, emails y dominios.
- [ ] DNS y dominios (web, links de pago `web.payLinksBase`, API).
- [ ] Remitente de correos: verificar el dominio en Resend y configurar `RESEND_FROM` en las Edge
      Functions (si no está, se usa `email.fromName`/`email.fromAddress`).
- [ ] Plantillas de email de Supabase Auth (recuperar contraseña, etc.): se editan en el panel de
      Supabase, no en este repo.
- [ ] Desplegar las Edge Functions (`supabase functions deploy`) después de cada cambio de marca.
- [ ] Textos legales (términos, privacidad, comisiones, arrepentimiento): validarlos con legales.
- [ ] Pedir a diseño la fotografía corporativa definitiva (hero/login) y la captura del panel.
- [ ] Satoshi se carga desde Fontshare (`api.fontshare.com`); evaluar autoalojarla.
