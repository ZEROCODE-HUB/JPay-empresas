import type { ReactNode } from "react";
import { Card } from "@/components/portal-shell";
import { estadoCatalogo, medioPagoLabels, type Lote } from "@/lib/api/cobros-masivos";
import { formatMoney } from "@/shared/format";
import type { ResumenRegistros } from "../utils";

function Titulo({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {children}
    </h4>
  );
}

function Fila({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const habilitadoClass = (on: boolean) =>
  `font-semibold ${on ? "text-emerald-600" : "text-muted-foreground"}`;

/** Los 4 bloques de información del lote: general, estadísticas, configuración y montos. */
export function LoteInfoCards({
  lote,
  resumen,
  className,
}: {
  lote: Lote;
  resumen: ResumenRegistros;
  className: string;
}) {
  const r = resumen;
  return (
    <div className={className}>
      <Card>
        <Titulo>Informacion general</Titulo>
        <div className="space-y-2 text-sm">
          <Fila label="ID">
            <span className="font-semibold">{lote.id}</span>
          </Fila>
          <Fila label="Estado">
            <span>{estadoCatalogo[lote.estado]?.label}</span>
          </Fila>
          <Fila label="Creacion">
            <span>{lote.createdAt.slice(0, 10)}</span>
          </Fila>
          <Fila label="Inicio">
            <span>{lote.fechaInicio?.slice(0, 10) ?? "-"}</span>
          </Fila>
          <Fila label="Finalizacion">
            <span>{lote.fechaFinalizacion?.slice(0, 10) ?? "-"}</span>
          </Fila>
        </div>
      </Card>

      <Card>
        <Titulo>Estadisticas</Titulo>
        <div className="space-y-2 text-sm">
          <Fila label="Total registros">
            <span className="font-semibold">{r.totalRegistros}</span>
          </Fila>
          <Fila label="% Cobrado">
            <span className="font-semibold text-emerald-600">{r.pctCobrado}%</span>
          </Fila>
          <Fila label="Pagos completos">
            <span className="font-semibold text-emerald-600">{r.cobrados}</span>
          </Fila>
          <Fila label="Pagos parciales">
            <span className="font-semibold text-amber-600">{r.parciales}</span>
          </Fila>
          <Fila label="Pendientes">
            <span className="font-semibold text-muted-foreground">{r.pendientes}</span>
          </Fila>
          {r.vencidos > 0 && (
            <Fila label="Vencidos">
              <span className="font-semibold text-danger-600">{r.vencidos}</span>
            </Fila>
          )}
          {r.conError > 0 && (
            <Fila label="Con error">
              <span className="font-semibold text-danger-600">{r.conError}</span>
            </Fila>
          )}
        </div>
      </Card>

      <Card>
        <Titulo>Configuracion</Titulo>
        <div className="space-y-2 text-sm">
          <Fila label="Medios de pago">
            <span className="font-semibold text-right max-w-[180px]">
              {lote.mediosPago
                .map((m) => medioPagoLabels[m as keyof typeof medioPagoLabels])
                .join(", ")}
            </span>
          </Fila>
          <Fila label="Pagos parciales">
            <span className={habilitadoClass(lote.pagosParcialesHabilitado)}>
              {lote.pagosParcialesHabilitado ? "Habilitados" : "Deshabilitados"}
            </span>
          </Fila>
          <Fila label="Notificaciones">
            <span className={habilitadoClass(lote.notificacionesHabilitado)}>
              {lote.notificacionesHabilitado ? "Habilitadas" : "Deshabilitadas"}
            </span>
          </Fila>
          <Fila label="Cuenta">
            <span className="font-semibold">Operaciones</span>
          </Fila>
          <Fila label="Tasa interes">
            <span className="font-semibold">{lote.tasaInteres}%</span>
          </Fila>
        </div>
      </Card>

      <Card>
        <Titulo>Montos</Titulo>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-display tabular-nums font-semibold text-lg">
              {formatMoney(r.montoTotal)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cobrado</span>
            <span className="font-display tabular-nums font-semibold text-emerald-600">
              {formatMoney(r.montoCobrado)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pendiente</span>
            <span className="font-display tabular-nums font-semibold text-amber-600">
              {formatMoney(r.montoTotal - r.montoCobrado)}
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${r.pctCobrado}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground text-center">{r.pctCobrado}% cobrado</div>
        </div>
      </Card>
    </div>
  );
}
