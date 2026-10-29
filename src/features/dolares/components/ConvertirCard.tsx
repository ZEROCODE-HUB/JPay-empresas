import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { useDolares } from "@/hooks/useCobre";
import type { Conversion, SubcuentaSpei } from "@/lib/api/cobre";
import { formatMoney, formatNumber, parseMonto } from "@/shared/format";

/**
 * Conversión de pesos a dólares (cotización de Cobre, vale 25 segundos). Fuera del horario de
 * mercado (5 a 16 h, hora del centro) la cotización puede tener otro límite o tasa.
 */
export function ConvertirCard({
  subcuentas,
  habilitada,
}: {
  subcuentas: SubcuentaSpei[];
  habilitada: boolean;
}) {
  const { cotizar, convertir } = useDolares();
  const pesos = subcuentas.filter((s) => s.moneda === "MXN");
  const [origen, setOrigen] = useState("");
  const [monto, setMonto] = useState("");
  const [q, setQ] = useState<(Conversion & { enHorario: boolean }) | null>(null);
  const [resta, setResta] = useState(0);
  const sub = pesos.find((s) => s.id === (origen || pesos[0]?.id));

  useEffect(() => {
    if (!q) return;
    const tick = () =>
      setResta(Math.max(0, Math.ceil((Date.parse(q.venceAt) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [q]);

  const pedir = () => {
    const importe = parseMonto(monto);
    if (!sub) return toast.error("Elegí una subcuenta en pesos");
    if (!(importe > 0)) return toast.error("Ingresá un monto");
    if (importe > sub.saldoDisponible) return toast.error("El monto supera el saldo disponible");
    cotizar.mutate(
      { subcuentaId: sub.id, montoMxn: importe },
      { onSuccess: setQ, onError: (e) => toast.error((e as Error).message) },
    );
  };

  const confirmar = () => {
    if (!q) return;
    convertir.mutate(q.id, {
      onSuccess: () => {
        toast.success("Conversión enviada: los dólares se acreditan en unos minutos");
        setQ(null);
        setMonto("");
      },
      onError: (e) => {
        toast.error((e as Error).message);
        setQ(null);
      },
    });
  };

  const comision = Number((q?.comisiones as { spread?: unknown } | undefined)?.spread ?? NaN);

  return (
    <Card>
      <h2 className="font-semibold">Convertir pesos a dólares</h2>
      {!habilitada ? (
        <p className="mt-2 text-sm text-black-400">
          Vas a poder convertir cuando tu cuenta en Cobre esté activa.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3 items-end">
          <div>
            <Label htmlFor="fx-origen">Desde</Label>
            <select
              id="fx-origen"
              className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm"
              value={sub?.id ?? ""}
              onChange={(e) => setOrigen(e.target.value)}
              disabled={!!q}
            >
              {pesos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {formatMoney(s.saldoDisponible)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="fx-monto">Pesos a convertir</Label>
            <Input
              id="fx-monto"
              className="mt-1"
              inputMode="decimal"
              value={monto}
              disabled={!!q}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div>
            {!q ? (
              <BtnPrimary onClick={pedir} disabled={cotizar.isPending}>
                {cotizar.isPending ? "Cotizando…" : "Cotizar"}
              </BtnPrimary>
            ) : (
              <BtnOutline onClick={() => setQ(null)}>Cambiar</BtnOutline>
            )}
          </div>
        </div>
      )}
      {q && (
        <div className="mt-4 rounded-md border border-black-100 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p>
                Recibís{" "}
                <span className="font-semibold">{formatMoney(q.montoUsd, { moneda: "USD" })}</span>{" "}
                por {formatMoney(q.montoMxn)}
              </p>
              <p className="text-xs text-black-400">
                Tipo de cambio: 1 MXN = {formatNumber(q.tasa, 6)} USD
                {Number.isFinite(comision) && ` · spread ${formatNumber(comision, 2)}%`}
              </p>
              {(!q.enHorario || q.fueraDeMercado) && (
                <p className="mt-1 text-xs text-amber-700">
                  Fuera del horario de mercado (5 a 16 h): la tasa y el límite pueden ser distintos.
                </p>
              )}
            </div>
            {resta > 0 ? (
              <BtnPrimary onClick={confirmar} disabled={convertir.isPending}>
                {convertir.isPending ? "Convirtiendo…" : `Convertir (${resta} s)`}
              </BtnPrimary>
            ) : (
              <BtnOutline onClick={pedir} disabled={cotizar.isPending}>
                La cotización venció: cotizar de nuevo
              </BtnOutline>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
