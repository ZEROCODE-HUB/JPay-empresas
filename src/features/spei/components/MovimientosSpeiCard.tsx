import { Badge, Card } from "@/components/portal-shell";
import type { DepositoSpei, EstadoSpei, TransferenciaSpei } from "@/lib/api/cobre";
import { formatDateTime, formatMoney } from "@/shared/format";

const ESTADO: Record<
  EstadoSpei,
  { label: string; tone: "success" | "warn" | "danger" | "neutral" }
> = {
  enviando: { label: "Enviando", tone: "warn" },
  pendiente: { label: "En proceso", tone: "warn" },
  pendiente_aprobacion: { label: "Esperando aprobación", tone: "warn" },
  completada: { label: "Completada", tone: "success" },
  rechazada: { label: "Rechazada", tone: "danger" },
  fallida: { label: "Fallida", tone: "danger" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  error_envio: { label: "No enviada", tone: "danger" },
};

/** Transferencias enviadas y depósitos recibidos por SPEI. */
export function MovimientosSpeiCard({
  transferencias,
  depositos,
}: {
  transferencias: TransferenciaSpei[];
  depositos: DepositoSpei[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="font-semibold">Transferencias enviadas</h2>
        {transferencias.length === 0 ? (
          <p className="mt-2 text-sm text-black-400">Todavía no enviaste transferencias.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black-100 text-sm">
            {transferencias.map((t) => {
              const e = ESTADO[t.estado];
              return (
                <li key={t.id} className="py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{t.destinatario ?? "—"}</div>
                      <div className="text-xs text-black-400">
                        {formatDateTime(t.creadaAt)} · {t.concepto ?? ""} · {t.idTxn}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums">{formatMoney(t.monto)}</div>
                      <Badge tone={e.tone}>{e.label}</Badge>
                    </div>
                  </div>
                  {t.motivo && t.estado !== "completada" && (
                    <p className="mt-1 text-xs text-danger-600">{t.motivo}</p>
                  )}
                  {(t.claveRastreo || t.cep) && (
                    <p className="mt-1 text-xs text-black-400">
                      {t.claveRastreo && `Clave de rastreo ${t.claveRastreo}`}
                      {t.cep && (
                        <>
                          {" · "}
                          <a
                            href={t.cep}
                            target="_blank"
                            rel="noreferrer"
                            className="text-secondary hover:underline"
                          >
                            Comprobante (CEP)
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold">Depósitos recibidos</h2>
        {depositos.length === 0 ? (
          <p className="mt-2 text-sm text-black-400">
            Todavía no recibiste depósitos en tus CLABEs.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black-100 text-sm">
            {depositos.map((d) => (
              <li key={d.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{d.remitente ?? "Remitente sin nombre"}</div>
                  <div className="text-xs text-black-400">
                    {formatDateTime(d.recibidoAt)} · CLABE {d.clabe?.slice(-4) ?? "—"}
                    {d.claveRastreo && ` · ${d.claveRastreo}`}
                  </div>
                </div>
                <div className="tabular-nums text-success">+{formatMoney(d.monto)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
