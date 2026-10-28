import { useState } from "react";
import { toast } from "sonner";
import { Badge, Card, Input, Label } from "@/components/portal-shell";
import { useCobrosEcartPay, useReembolsarCobro } from "@/hooks/useIntegraciones";
import { esReembolsable, type CobroProveedor, type MotivoReembolso } from "@/lib/api/integraciones";
import { formatDateTime, formatMoney, parseMonto } from "@/shared/format";
import { FormDialog } from "@/shared/ui/form-dialog";

const METODO: Record<string, string> = { spei: "SPEI", oxxo: "OXXO", card: "Tarjeta" };
const ESTADO: Record<string, { label: string; tone: "success" | "warn" | "danger" | "neutral" }> = {
  pagado: { label: "Pagado", tone: "success" },
  pendiente: { label: "Pendiente", tone: "warn" },
  creado: { label: "Sin pagar", tone: "neutral" },
  rechazado: { label: "Rechazado", tone: "danger" },
  cancelado: { label: "Cancelado", tone: "neutral" },
  reembolsado: { label: "Reembolsado", tone: "neutral" },
  parcialmente_reembolsado: { label: "Reembolso parcial", tone: "warn" },
};
const MOTIVOS: { id: MotivoReembolso; label: string }[] = [
  { id: "requested", label: "Lo pidió el cliente" },
  { id: "duplicate", label: "Pago duplicado" },
  { id: "fraudulent", label: "Posible fraude" },
];

/** Cobros del comercio con Ecart Pay y reembolsos (solo tarjeta). */
export function CobrosEcartPayCard() {
  const { data = [], isLoading, error } = useCobrosEcartPay(true);
  const reembolsar = useReembolsarCobro();
  const [cobro, setCobro] = useState<CobroProveedor | null>(null);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState<MotivoReembolso>("requested");
  const [nota, setNota] = useState("");

  const abrir = (c: CobroProveedor) => {
    setCobro(c);
    setMonto(String(c.monto - c.reembolsado));
    setMotivo("requested");
    setNota("");
  };
  const disponible = cobro ? cobro.monto - cobro.reembolsado : 0;
  const confirmar = () => {
    if (!cobro) return;
    const m = parseMonto(monto);
    if (!(m > 0) || m > disponible) {
      toast.error(`El monto debe ser mayor a 0 y hasta ${formatMoney(disponible)}`);
      return;
    }
    reembolsar.mutate(
      { pagoId: cobro.id, monto: m, motivo, nota: nota.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Reembolso solicitado a Ecart Pay");
          setCobro(null);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Card>
      <h2 className="font-semibold">Cobros recibidos</h2>
      <p className="text-xs text-black-400 mt-1">
        Cobros de tus links de pago con Ecart Pay. Los pagos con tarjeta se pueden reembolsar; los
        de SPEI y OXXO no.
      </p>
      {isLoading ? (
        <p className="mt-4 text-sm text-black-400">Cargando…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-danger-600">No se pudieron cargar los cobros.</p>
      ) : data.length === 0 ? (
        <p className="mt-4 text-sm text-black-400">Todavía no recibiste cobros.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-black-400 text-left">
              <tr>
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Pagador</th>
                <th className="py-2 pr-4">Medio</th>
                <th className="py-2 pr-4 text-right">Monto</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const e = ESTADO[c.estado] ?? { label: c.estado, tone: "neutral" as const };
                return (
                  <tr key={c.id} className="border-t border-black-100 align-top">
                    <td className="py-2 pr-4 text-xs whitespace-nowrap">
                      {formatDateTime(c.pagadoAt ?? c.creadoAt)}
                    </td>
                    <td className="py-2 pr-4">{c.pagador ?? "—"}</td>
                    <td className="py-2 pr-4">{METODO[c.metodo ?? ""] ?? c.metodo ?? "Tarjeta"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatMoney(c.monto)}
                      {c.reembolsado > 0 && (
                        <span className="block text-xs text-black-400">
                          −{formatMoney(c.reembolsado)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={e.tone}>{e.label}</Badge>
                      {c.contracargo && <AvisoContracargo {...c.contracargo} />}
                    </td>
                    <td className="py-2 text-right">
                      {esReembolsable(c) && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-danger-600 hover:underline"
                          onClick={() => abrir(c)}
                        >
                          Reembolsar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <FormDialog
        open={!!cobro}
        onClose={() => setCobro(null)}
        title="Reembolsar cobro"
        description={cobro ? `Disponible para reembolsar: ${formatMoney(disponible)}` : undefined}
        submitLabel={reembolsar.isPending ? "Enviando…" : "Reembolsar"}
        isSubmitting={reembolsar.isPending}
        onSubmit={confirmar}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="reemb-monto">Monto</Label>
            <Input
              id="reemb-monto"
              className="mt-1"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="reemb-motivo">Motivo</Label>
            <select
              id="reemb-motivo"
              className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as MotivoReembolso)}
            >
              {MOTIVOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="reemb-nota">Nota interna (opcional)</Label>
            <Input
              id="reemb-nota"
              className="mt-1"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
        </div>
      </FormDialog>
    </Card>
  );
}

const CONTRACARGO: Record<string, string> = {
  created: "Contracargo abierto",
  pending: "Contracargo pendiente",
  in_review: "Contracargo en revisión",
  won: "Contracargo ganado",
  lost: "Contracargo perdido",
};

/** Aviso de contracargo: mientras esté abierto, el plazo para presentar pruebas en Ecart Pay. */
function AvisoContracargo({ estado, venceAt }: { estado: string; venceAt: string | null }) {
  const abierto = estado === "created" || estado === "pending";
  return (
    <span className="block mt-1 text-[11px] font-semibold">
      <Badge tone={estado === "won" ? "success" : abierto || estado === "lost" ? "danger" : "warn"}>
        {CONTRACARGO[estado] ?? `Contracargo ${estado}`}
      </Badge>
      {abierto && venceAt && (
        <span className="block text-danger-600 mt-0.5">
          Presentá pruebas en Ecart Pay antes del {formatDateTime(venceAt)}
        </span>
      )}
    </span>
  );
}
