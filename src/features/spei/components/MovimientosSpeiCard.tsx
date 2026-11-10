import { Badge, Card } from "@/components/portal-shell";
import type { DepositoSpei, TransferenciaSpei } from "@/lib/api/cobre";
import { formatDateTime, formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import { ESTADO_ENVIO } from "../estados";

/** Transferencias SPEI enviadas (sueltas o en lote) y depósitos recibidos (a la CLABE o por cobro). */
export function MovimientosSpeiCard({
  transferencias,
  depositos,
}: {
  transferencias: TransferenciaSpei[];
  depositos: DepositoSpei[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TransferenciasSpeiCard transferencias={transferencias} />
      <DepositosSpeiCard depositos={depositos} />
    </div>
  );
}

/** Transferencias SPEI enviadas, sueltas o en lote. */
export function TransferenciasSpeiCard({
  transferencias,
}: {
  transferencias: TransferenciaSpei[];
}) {
  return (
    <Card>
      <h2 className="font-semibold">
        Transferencias enviadas
        <InfoTip className="ml-1">
          Tus transferencias SPEI en pesos más recientes (hasta 50), sueltas o en lote, con el
          estado actual. El monto no incluye la comisión.
        </InfoTip>
      </h2>
      {transferencias.length === 0 ? (
        <p className="mt-2 text-sm text-black-400">Todavía no enviaste transferencias.</p>
      ) : (
        <ul className="mt-3 divide-y divide-black-100 text-sm">
          {transferencias.map((t) => {
            const e = ESTADO_ENVIO[t.estado];
            return (
              <li key={t.id} className="py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{t.destinatario ?? "—"}</div>
                    <div className="text-xs text-black-400">
                      {formatDateTime(t.creadaAt)} · {t.concepto ?? ""} · {t.idTxn}
                      {t.loteId && " · en lote"}
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
  );
}

/** Depósitos recibidos a la CLABE o por cobro con CLABE única. */
export function DepositosSpeiCard({ depositos }: { depositos: DepositoSpei[] }) {
  return (
    <Card>
      <h2 className="font-semibold">
        Depósitos recibidos
        <InfoTip align="right" className="ml-1">
          Tus depósitos SPEI más recientes (hasta 50) que llegaron a tu CLABE: directos («A tu
          CLABE») o pagos de tus cobros por SPEI.
        </InfoTip>
      </h2>
      {depositos.length === 0 ? (
        <p className="mt-2 text-sm text-black-400">Todavía no recibiste depósitos.</p>
      ) : (
        <ul className="mt-3 divide-y divide-black-100 text-sm">
          {depositos.map((d) => (
            <li key={d.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{d.remitente ?? "Remitente sin nombre"}</div>
                <div className="text-xs text-black-400">
                  {formatDateTime(d.recibidoAt)} ·{" "}
                  {d.origen === "r2p" ? "Cobro por SPEI" : "A tu CLABE"}
                  {d.claveRastreo && ` · ${d.claveRastreo}`}
                </div>
              </div>
              <div className="tabular-nums text-success">+{formatMoney(d.monto)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
