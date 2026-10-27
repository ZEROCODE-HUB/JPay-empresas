import { Lock, Pause, Pencil, Play } from "lucide-react";
import { Badge, Input } from "@/components/portal-shell";
import type { useDetalleSubcuenta } from "../hooks/useDetalleSubcuenta";
import type { EstadoSub, Sub } from "../types";

const confirmAction = (accion: string, detalle: string): boolean =>
  window.confirm(`¿Estas seguro de que queres ${accion}?\n\n${detalle}`);

type Props = {
  sub: Sub;
  d: ReturnType<typeof useDetalleSubcuenta>;
  onCambiarEstado: (id: string, estado: EstadoSub) => void;
  onGuardarEmail: (id: string, email: string) => Promise<boolean>;
};

export function DetalleInfoGeneral({ sub, d, onCambiarEstado, onGuardarEmail }: Props) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Informacion general</h3>
        <div className="flex gap-1">
          <button
            onClick={() => {
              if (
                confirmAction(
                  sub.e === "Activa" ? "pausar esta subcuenta" : "reactivar esta subcuenta",
                  "Los fondos quedaran " +
                    (sub.e === "Activa"
                      ? "congelados hasta que la reactives."
                      : "disponibles nuevamente."),
                )
              )
                onCambiarEstado(sub.id!, sub.e === "Activa" ? "Pausada" : "Activa");
            }}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition text-muted-foreground hover:text-foreground"
            title={sub.e === "Activa" ? "Deshabilitar cuenta" : "Reactivar cuenta"}
          >
            {sub.e === "Activa" ? <Pause size={13} /> : <Play size={13} />}
          </button>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Nombre
            </span>
            <p className="font-semibold mt-0.5">{sub.n}</p>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {d.editEmail ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={d.emailVal}
                    onChange={(e) => d.setEmailVal(e.target.value)}
                    className="h-8 text-sm flex-1 min-w-0"
                  />
                  <button
                    onClick={async () => {
                      const email = d.emailVal.trim();
                      if (!sub.id || email === sub.email) {
                        d.setEditEmail(false);
                        return;
                      }
                      if (await onGuardarEmail(sub.id, email)) d.setEditEmail(false);
                    }}
                    className="h-8 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded border"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => {
                      d.setEditEmail(false);
                      d.setEmailVal(sub.email);
                    }}
                    className="h-8 px-2 text-xs text-muted-foreground hover:bg-muted rounded border"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-muted-foreground">{d.emailVal || "—"}</span>
                  <button
                    onClick={() => d.setEditEmail(true)}
                    className="text-muted-foreground hover:text-foreground transition"
                    title="Editar email"
                  >
                    <Pencil size={12} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge tone={sub.e === "Activa" ? "success" : "warn"}>
            {sub.e === "Activa" ? "Activo" : "Desactivado"}
          </Badge>
          <Badge tone={sub.retirosHab ? "success" : "neutral"}>
            <Lock size={11} className="inline mr-0.5" /> Retiros{" "}
            {sub.retirosHab ? "Habilitados" : "Deshabilitados"}
          </Badge>
        </div>
      </div>
    </section>
  );
}
