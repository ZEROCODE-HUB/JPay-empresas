import { ArrowDownLeft, ArrowUpRight, CreditCard } from "lucide-react";
import { useMemo } from "react";
import { useCuentaSpei } from "@/hooks/useCobre";
import { useReporteCobros } from "@/hooks/useIntegraciones";
import { formatMoney } from "@/shared/format";
import { usePaisConModulos } from "@/shared/modulos-pais";
import { toKey, totalesSpei } from "../utils";
import { Kpi } from "./DashboardKpis";

type Rango = { start: Date; end: Date };

/** KPIs del período por proveedor: cobros con tarjeta (Ecart Pay) y SPEI (Cobre). */
export function KpisProveedores({ range }: { range: Rango }) {
  const pais = usePaisConModulos();
  return (
    <>
      {pais.modulos.pagos_proveedor && <KpiTarjeta range={range} />}
      {pais.modulos.transferencias_cobre && <KpisSpei range={range} />}
    </>
  );
}

function KpiTarjeta({ range }: { range: Rango }) {
  const rango = useMemo(
    () => ({ desde: toKey(range.start), hasta: toKey(range.end) }),
    [range.start, range.end],
  );
  const { data, error } = useReporteCobros(rango);
  const s = data?.resumen;
  return (
    <Kpi
      label="Cobros con tarjeta"
      value={s ? formatMoney(s.cobrado) : "—"}
      sub={
        s ? `${s.cantidad} cobros con Ecart Pay` : error ? "Sin datos de Ecart Pay" : "Cargando…"
      }
      info="Cobros que Ecart Pay marcó como pagados en el período elegido, con cualquier medio (tarjeta, SPEI u OXXO). Es el monto cobrado antes de comisiones; los reembolsos posteriores no se restan."
      icon={<CreditCard size={18} />}
      iconClass="bg-secondary-50 text-secondary-500"
    />
  );
}

function KpisSpei({ range }: { range: Rango }) {
  const { transferencias, depositos } = useCuentaSpei();
  const listo = !!transferencias.data && !!depositos.data;
  const espera = transferencias.error || depositos.error ? "Sin datos de SPEI" : "Cargando…";
  const t = useMemo(
    () => totalesSpei(depositos.data ?? [], transferencias.data ?? [], range.start, range.end),
    [depositos.data, transferencias.data, range.start, range.end],
  );
  return (
    <>
      <Kpi
        label="SPEI recibido"
        value={listo ? formatMoney(t.recibido) : "—"}
        sub={listo ? `${t.opsRecibido} depósitos` : espera}
        info="Depósitos SPEI recibidos en tu CLABE de Cobre (directos o por cobros SPEI) dentro del período elegido. Se calcula con tus 50 depósitos más recientes."
        icon={<ArrowDownLeft size={18} />}
        iconClass="bg-success-bg text-success"
      />
      <Kpi
        label="SPEI enviado"
        value={listo ? formatMoney(t.enviado) : "—"}
        sub={listo ? `${t.opsEnviado} transferencias` : espera}
        info="Transferencias SPEI en pesos que enviaste en el período elegido, sueltas o en lote. No cuenta las rechazadas, fallidas, canceladas ni devueltas. Se calcula con tus 50 envíos más recientes."
        infoAlign="right"
        icon={<ArrowUpRight size={18} />}
        iconClass="bg-error-bg text-error"
      />
    </>
  );
}
