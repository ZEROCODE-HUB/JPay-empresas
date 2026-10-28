import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/portal-shell";
import { useCuentaSpeiMutaciones } from "@/hooks/useCobre";
import type { SubcuentaSpei } from "@/lib/api/cobre";
import { formatMoney } from "@/shared/format";

/** CLABE de cada subcuenta para recibir transferencias SPEI (como el CVU en Argentina). */
export function ClabesCard({ subcuentas }: { subcuentas: SubcuentaSpei[] }) {
  const { generarClabe } = useCuentaSpeiMutaciones();
  const copiar = (clabe: string) =>
    navigator.clipboard.writeText(clabe).then(
      () => toast.success("CLABE copiada"),
      () => toast.error("No se pudo copiar"),
    );

  return (
    <Card>
      <h2 className="font-semibold">Tus CLABEs para recibir dinero</h2>
      <p className="text-xs text-black-400 mt-1">
        Compartí la CLABE de una subcuenta: lo que te transfieran por SPEI se acredita en esa
        subcuenta.
      </p>
      {subcuentas.length === 0 ? (
        <p className="mt-4 text-sm text-black-400">
          Todavía no tenés subcuentas. Creala en Subcuentas y volvé acá para generar su CLABE.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-black-100 text-sm">
          {subcuentas.map((s) => (
            <li key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">{s.nombre}</div>
                <div className="text-xs text-black-400">
                  Disponible {formatMoney(s.saldoDisponible)}
                  {s.saldoRetenido > 0 && ` · Retenido ${formatMoney(s.saldoRetenido)}`}
                </div>
              </div>
              {s.clabe ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 font-mono text-sm hover:text-secondary"
                  onClick={() => copiar(s.clabe!)}
                  title="Copiar CLABE"
                >
                  {s.clabe.replace(/(\d{3})(\d{3})(\d{11})(\d)/, "$1 $2 $3 $4")}
                  <Copy size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs font-semibold text-secondary hover:underline disabled:opacity-50"
                  disabled={generarClabe.isPending}
                  onClick={() =>
                    generarClabe.mutate(s.id, {
                      onSuccess: () => toast.success("CLABE generada"),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                >
                  {generarClabe.isPending ? "Generando…" : "Generar CLABE"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
