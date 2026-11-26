import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { BtnOutline } from "@/components/portal-shell";

/**
 * Estados de cuenta mensuales de las cuentas del cliente (PDF que emite el proveedor). Lo usan el
 * portal (Reportes) y el admin (ficha del cliente); cada uno pasa sus funciones de consulta.
 */

export type CuentaEstados = {
  cuenta: string;
  nombre: string;
  clabe: string | null;
  moneda: string;
  activa: boolean;
  periodos: string[];
};

export type DescargaEstado =
  { estado: "generando" } | { estado: "listo"; nombre: string; pdf: string };

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const mes = (p: string) => {
  const [a, m] = p.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
};

function guardarPdf(nombre: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function EstadosCuentaPanel({
  cuentas,
  descargar,
  vacio = "Todavía no hay estados de cuenta: aparecen al cerrar el primer mes de la cuenta.",
}: {
  cuentas: CuentaEstados[];
  descargar: (cuenta: string, periodo: string) => Promise<DescargaEstado>;
  vacio?: string;
}) {
  const [bajando, setBajando] = useState<string | null>(null);
  const conMeses = cuentas.filter((c) => c.periodos.length > 0);

  // El proveedor genera el PDF la primera vez que se pide: se reintenta unos segundos.
  const bajar = async (cuenta: string, periodo: string) => {
    const clave = `${cuenta}:${periodo}`;
    setBajando(clave);
    try {
      for (let intento = 0; intento < 6; intento++) {
        const r = await descargar(cuenta, periodo);
        if (r.estado === "listo") {
          guardarPdf(r.nombre, r.pdf);
          toast.success("Estado de cuenta descargado");
          return;
        }
        await esperar(5_000);
      }
      toast.info("El estado de cuenta se está generando. Inténtalo de nuevo en unos minutos.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBajando(null);
    }
  };

  if (conMeses.length === 0) return <p className="text-sm text-muted-foreground">{vacio}</p>;
  return (
    <div className="space-y-5">
      {conMeses.map((c) => (
        <div key={c.cuenta}>
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{c.nombre}</span>
            {c.clabe && <span className="font-mono text-xs text-muted-foreground">{c.clabe}</span>}
            {!c.activa && <span className="text-xs text-muted-foreground">(cerrada)</span>}
          </div>
          <ul className="mt-2 divide-y divide-border text-sm">
            {c.periodos.map((p) => {
              const clave = `${c.cuenta}:${p}`;
              return (
                <li key={p} className="flex items-center justify-between gap-3 py-2">
                  <span className="capitalize">{mes(p)}</span>
                  <BtnOutline disabled={bajando !== null} onClick={() => void bajar(c.cuenta, p)}>
                    <Download size={15} />
                    {bajando === clave ? "Preparando…" : "Descargar PDF"}
                  </BtnOutline>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
