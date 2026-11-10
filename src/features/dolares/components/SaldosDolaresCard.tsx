import { Card } from "@/components/portal-shell";
import type { Conversion, SubcuentaSpei } from "@/lib/api/cobre";
import { formatMoney } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import { CONVERSION_EN_CURSO } from "../estados";

/**
 * Saldos de la pantalla Dólares: pesos disponibles, pesos apartados por conversiones (o envíos)
 * en curso y dólares, con lo que está por llegar de las conversiones que Cobre todavía procesa.
 */
export function SaldosDolaresCard({
  subcuentas,
  conversiones,
}: {
  subcuentas: SubcuentaSpei[];
  conversiones: Conversion[];
}) {
  const pesos = subcuentas.filter((s) => s.moneda === "MXN");
  const usd = subcuentas.filter((s) => s.moneda === "USD");
  const suma = (xs: SubcuentaSpei[], k: "saldoDisponible" | "saldoRetenido") =>
    xs.reduce((a, s) => a + s[k], 0);
  const enCurso = conversiones.filter((c) => CONVERSION_EN_CURSO.includes(c.estado));
  const porRecibir = enCurso.reduce((a, c) => a + c.montoUsd, 0);
  const retenidoMxn = suma(pesos, "saldoRetenido");

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-black-400">
            Pesos disponibles
            <InfoTip className="ml-1">
              Lo que puedes convertir o enviar ahora, sumando tus subcuentas en pesos.
            </InfoTip>
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">
            {formatMoney(suma(pesos, "saldoDisponible"))}
          </div>
        </div>
        <div>
          <div className="text-xs text-black-400">
            Pesos apartados
            <InfoTip className="ml-1">
              Pesos que ya salieron de tu saldo disponible por conversiones o envíos que todavía
              están en proceso. Si la operación termina bien, salen de tu cuenta; si falla, vuelven
              a tu saldo disponible.
            </InfoTip>
          </div>
          <div
            className={`mt-1 text-xl font-bold tabular-nums ${retenidoMxn > 0 ? "text-amber-700" : ""}`}
          >
            {formatMoney(retenidoMxn)}
          </div>
          {enCurso.length > 0 && (
            <div className="text-xs text-amber-700 mt-0.5">
              {enCurso.length === 1
                ? "1 conversión en proceso"
                : `${enCurso.length} conversiones en proceso`}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-black-400">
            Dólares disponibles
            <InfoTip className="ml-1">
              Saldo de tu subcuenta en dólares. «Por recibir» son los dólares de las conversiones
              que Cobre todavía procesa: se suman aquí cuando terminan, en unos minutos.
            </InfoTip>
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">
            {formatMoney(suma(usd, "saldoDisponible"), { moneda: "USD" })}
          </div>
          {porRecibir > 0 && (
            <div className="text-xs text-amber-700 mt-0.5">
              Por recibir: {formatMoney(porRecibir, { moneda: "USD" })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
