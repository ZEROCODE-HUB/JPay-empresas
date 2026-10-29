import { Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card } from "@/components/portal-shell";
import { useCuentaSpeiMutaciones } from "@/hooks/useCobre";
import type { CuentaCobre, SubcuentaSpei } from "@/lib/api/cobre";
import { formatMoney } from "@/shared/format";

const ALTA: Record<string, { label: string; tone: "success" | "warn" | "danger" | "neutral" }> = {
  enviando: { label: "Enviando el alta", tone: "warn" },
  processing: { label: "En revisión por Cobre", tone: "warn" },
  approved: { label: "Aprobada", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  failed: { label: "Con error", tone: "danger" },
  error_envio: { label: "No enviada", tone: "danger" },
};

const formatoClabe = (c: string) => c.replace(/(\d{3})(\d{3})(\d{11})(\d)/, "$1 $2 $3 $4");

/**
 * Cuenta del comercio en Cobre: estado del alta (Subcliente), CLABE de su Cobre Balance y la
 * subcuenta en pesos que la recibe. Las demás subcuentas son saldos de JPay.
 */
export function ClabesCard({
  cuenta,
  subcuentas,
}: {
  cuenta: CuentaCobre;
  subcuentas: SubcuentaSpei[];
}) {
  const { receptora } = useCuentaSpeiMutaciones();
  const pesos = subcuentas.filter((s) => s.moneda === "MXN");
  const c = cuenta.cuenta;
  const copiar = (clabe: string) =>
    navigator.clipboard.writeText(clabe).then(
      () => toast.success("CLABE copiada"),
      () => toast.error("No se pudo copiar"),
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Tu cuenta para recibir dinero</h2>
        {c ? (
          <Badge tone={c.conectividad && c.conectividad !== "connected" ? "warn" : "success"}>
            {c.conectividad && c.conectividad !== "connected" ? "Activándose" : "Activa"}
          </Badge>
        ) : cuenta.alta ? (
          <Badge tone={ALTA[cuenta.alta.estado]?.tone ?? "neutral"}>
            {ALTA[cuenta.alta.estado]?.label ?? cuenta.alta.estado}
          </Badge>
        ) : null}
      </div>

      {!c ? (
        <div className="mt-3 text-sm">
          {!cuenta.alta ? (
            <p className="text-black-400">
              Todavía no tenés tu cuenta en Cobre. Completá los datos de la empresa, sus
              representantes y beneficiarios en{" "}
              <Link to="/app/cuenta" className="font-semibold text-secondary hover:underline">
                Mi cuenta
              </Link>{" "}
              y JPay envía el alta.
            </p>
          ) : cuenta.alta.estado === "rejected" ||
            cuenta.alta.estado === "failed" ||
            cuenta.alta.estado === "error_envio" ? (
            <p className="text-danger-600">
              {cuenta.alta.motivo ?? "Cobre no aprobó el alta"}. Corregí los datos en{" "}
              <Link to="/app/cuenta" className="font-semibold hover:underline">
                Mi cuenta
              </Link>{" "}
              y JPay envía una nueva.
            </p>
          ) : (
            <p className="text-black-400">
              Cobre está revisando los datos de tu empresa. Cuando la apruebe vas a ver acá tu
              CLABE.
            </p>
          )}
          {cuenta.faltan.length > 0 && !cuenta.alta && (
            <p className="mt-2 text-xs text-black-400">Falta: {cuenta.faltan.join(" · ")}</p>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-black-400">CLABE de tu cuenta (para recibir SPEI)</p>
            {c.clabe ? (
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-2 font-mono text-lg hover:text-secondary"
                onClick={() => copiar(c.clabe!)}
                title="Copiar CLABE"
              >
                {formatoClabe(c.clabe)}
                <Copy size={16} />
              </button>
            ) : (
              <p className="mt-1 text-sm text-black-400">Cobre todavía no asignó la CLABE.</p>
            )}
          </div>
          <div>
            <label htmlFor="spei-receptora" className="text-xs text-black-400">
              Lo que recibas se acredita en
            </label>
            <select
              id="spei-receptora"
              className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm"
              value={c.subcuenta_id ?? ""}
              disabled={receptora.isPending}
              onChange={(e) =>
                receptora.mutate(e.target.value, {
                  onSuccess: () => toast.success("Subcuenta actualizada"),
                  onError: (er) => toast.error((er as Error).message),
                })
              }
            >
              {pesos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {formatMoney(s.saldoDisponible)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {pesos.length > 0 && (
        <ul className="mt-4 divide-y divide-black-100 text-sm">
          {pesos.map((s) => (
            <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium">{s.nombre}</span>
              <span className="text-xs text-black-400">
                Disponible {formatMoney(s.saldoDisponible)}
                {s.saldoRetenido > 0 && ` · Retenido ${formatMoney(s.saldoRetenido)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
