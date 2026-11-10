import type { DestinatarioSpei } from "@/lib/api/cobre";
import { parseMonto } from "@/shared/format";
import { validarClabe, validarCurp, validarRfc } from "@/shared/validadores";

/** Columnas del archivo de envío masivo por SPEI, en orden. */
export const COLUMNAS_LOTE_SPEI = ["clabe", "titular", "rfc_o_curp", "monto", "concepto"] as const;

/** Largo máximo del concepto que acepta SPEI. */
export const LARGO_CONCEPTO = 40;

/** Las filas de ejemplo de la plantilla llevan este concepto: si se dejan, no se pagan. */
const MARCA_EJEMPLO = "EJEMPLO";

const FILAS_EJEMPLO = [
  [
    "032180000118359719",
    "Gerardo Gómez Díaz",
    "GODE561231GR8",
    "1500.00",
    `${MARCA_EJEMPLO} - borra esta fila`,
  ],
  [
    "032180000118359719",
    "Guadalupe Hernández",
    "HEGG560427MVZRRL04",
    "320.50",
    `${MARCA_EJEMPLO} - borra esta fila`,
  ],
];

export type FilaLoteSpei = {
  n: number;
  clabe: string;
  titular: string;
  idNumero: string;
  monto: number;
  concepto: string;
  error: string | null;
  destinatario: DestinatarioSpei | null;
};

/** Contenido CSV de la plantilla (con BOM para que Excel lea bien los acentos). */
export function plantillaLoteSpeiCsv(): string {
  const celda = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lineas = [
    COLUMNAS_LOTE_SPEI.join(","),
    ...FILAS_EJEMPLO.map((f) => f.map(celda).join(",")),
  ];
  return `\uFEFF${lineas.join("\r\n")}\r\n`;
}

export function descargarPlantillaLoteSpei() {
  const blob = new Blob([plantillaLoteSpeiCsv()], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-envio-masivo-spei.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Separador del archivo: el que más aparece (fuera de comillas) en la primera línea. */
function detectarSeparador(linea: string): string {
  const cuenta: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let comillas = false;
  for (const c of linea) {
    if (c === '"') comillas = !comillas;
    else if (!comillas && c in cuenta) cuenta[c]++;
  }
  const [sep, veces] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return veces > 0 ? sep : ",";
}

/** Parte el texto en filas y celdas respetando comillas (`"1,500.00"` es una sola celda). */
export function partirCsv(texto: string): string[][] {
  const limpio = texto.replace(/^\uFEFF/, "");
  const primera = limpio.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = detectarSeparador(primera);
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(celda.trim());
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda.trim());
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  fila.push(celda.trim());
  filas.push(fila);
  return filas.filter((f) => f.some(Boolean));
}

/** Columnas: CLABE, titular, RFC o CURP, monto, concepto (con o sin encabezado). */
export function leerLoteSpei(texto: string, destinatarios: DestinatarioSpei[]): FilaLoteSpei[] {
  const filas = partirCsv(texto);
  if (filas.length && filas[0].some((c) => /clabe/i.test(c))) filas.shift();
  return filas.map(([clabe = "", titular = "", id = "", monto = "", ...resto], i) => {
    const numero = clabe.replace(/[\s-]/g, "");
    const idNumero = id.replace(/[\s-]/g, "").toUpperCase();
    const importe = parseMonto(monto);
    const concepto = resto.filter(Boolean).join(" ").trim();
    const error =
      (concepto.toUpperCase().startsWith(MARCA_EJEMPLO) ? "Fila de ejemplo: bórrala" : null) ??
      validarClabe(numero) ??
      (idNumero.length === 18 ? validarCurp(idNumero) : validarRfc(idNumero)) ??
      (!titular ? "Falta el titular" : null) ??
      (!(importe > 0) ? "Monto inválido" : null);
    return {
      n: i + 1,
      clabe: numero.replace(/\D/g, ""),
      titular,
      idNumero,
      monto: importe,
      concepto: concepto.slice(0, LARGO_CONCEPTO) || "Pago",
      error,
      destinatario:
        destinatarios.find((d) => d.numero === numero && d.idNumero === idNumero) ?? null,
    };
  });
}

/** Lee el archivo subido como texto CSV; un Excel se convierte tomando su primera hoja. */
export async function archivoATexto(f: File): Promise<string> {
  if (/\.xlsx?$/i.test(f.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    return hoja ? XLSX.utils.sheet_to_csv(hoja, { rawNumbers: false }) : "";
  }
  return f.text();
}
