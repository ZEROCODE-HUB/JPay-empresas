import { Badge, Card } from "@/components/portal-shell";
import type { Conversion, TransferenciaSpei } from "@/lib/api/cobre";
import { formatDateTime, formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import { ESTADO_ENVIO } from "@/features/spei/estados";

const CONVERSION: Record<
  string,
  { label: string; tone: "success" | "warn" | "danger" | "neutral" }
> = {
  pendiente_aprobacion: { label: "Esperando aprobación", tone: "warn" },
  enviando: { label: "Enviando", tone: "warn" },
  initiated: { label: "En proceso", tone: "warn" },
  processing: { label: "En proceso", tone: "warn" },
  completada: { label: "Completada", tone: "success" },
  rechazada: { label: "Rechazada", tone: "danger" },
  fallida: { label: "Fallida", tone: "danger" },
  vencida: { label: "Cotización vencida", tone: "neutral" },
  error_envio: { label: "No enviada", tone: "danger" },
};

/** Conversiones de pesos a dólares. */
export function ConversionesCard({ conversiones }: { conversiones: Conversion[] }) {
  return (
    <Card>
      <h2 className="font-semibold">
        Conversiones
        <InfoTip className="ml-1">
          Tus conversiones de pesos a dólares más recientes (hasta 30), sin las cotizaciones que no
          confirmaste. A la izquierda, los pesos que salieron; a la derecha, los dólares que
          recibiste.
        </InfoTip>
      </h2>
      {conversiones.length === 0 ? (
        <p className="mt-2 text-sm text-black-400">Todavía no convertiste pesos a dólares.</p>
      ) : (
        <ul className="mt-3 divide-y divide-black-100 text-sm">
          {conversiones.map((c) => (
            <li key={c.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">
                  {formatMoney(c.montoMxn)} → {formatMoney(c.montoUsd, { moneda: "USD" })}
                </div>
                <div className="text-xs text-black-400">{formatDateTime(c.creadaAt)}</div>
                {c.motivo && <p className="text-xs text-danger-600">{c.motivo}</p>}
              </div>
              <Badge tone={CONVERSION[c.estado]?.tone ?? "neutral"}>
                {CONVERSION[c.estado]?.label ?? c.estado}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Envíos en dólares (Fedwire / SWIFT). */
export function EnviosDolaresCard({ envios }: { envios: TransferenciaSpei[] }) {
  return (
    <Card>
      <h2 className="font-semibold">
        Envíos en dólares
        <InfoTip className="ml-1">
          Tus envíos en dólares más recientes por Fedwire o SWIFT, con su estado actual. Se toman de
          tus últimas 50 transferencias.
        </InfoTip>
      </h2>
      {envios.length === 0 ? (
        <p className="mt-2 text-sm text-black-400">Todavía no enviaste dólares.</p>
      ) : (
        <ul className="mt-3 divide-y divide-black-100 text-sm">
          {envios.map((t) => {
            const e = ESTADO_ENVIO[t.estado];
            return (
              <li key={t.id} className="py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{t.destinatario ?? "—"}</div>
                    <div className="text-xs text-black-400">
                      {t.tipo === "swift" ? "SWIFT" : "Fedwire"} · {formatDateTime(t.creadaAt)} ·{" "}
                      {t.idTxn}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums">{formatMoney(t.monto, { moneda: "USD" })}</div>
                    <Badge tone={e.tone}>{e.label}</Badge>
                  </div>
                </div>
                {t.motivo && t.estado !== "completada" && (
                  <p className="mt-1 text-xs text-danger-600">{t.motivo}</p>
                )}
                {t.swiftUetr && <p className="mt-1 text-xs text-black-400">UETR {t.swiftUetr}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
