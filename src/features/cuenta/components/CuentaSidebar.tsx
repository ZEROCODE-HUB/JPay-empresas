import type { ReactNode } from "react";
import { CreditCard, Download, Landmark, SlidersHorizontal } from "lucide-react";
import { brand } from "@/brand/brand";
import { Badge, BtnOutline, BtnPrimary, Card } from "@/components/portal-shell";
import { formatMoney, formatNumber } from "@/shared/format";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";

function Fila({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function PlanCard({ c }: { c: CuentaPantalla }) {
  const { plan } = c;
  return (
    <Card className="bg-gradient-to-br from-[color:var(--brand-primary-50)] to-card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{plan.nombre}</h3>
        <Badge tone="success">Activo</Badge>
      </div>
      <div className="font-display tabular-nums text-2xl font-semibold">{plan.precio}</div>
      <div className="text-xs text-muted-foreground">{plan.ops}</div>
      <div className="mt-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Consumo del mes</span>
          <span className="font-semibold">
            {formatNumber(plan.used)} / {formatNumber(plan.total)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${(plan.used / plan.total) * 100}%` }}
          />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <BtnPrimary className="flex-1">Ampliar plan</BtnPrimary>
        <BtnOutline>Ver detalle</BtnOutline>
      </div>
    </Card>
  );
}

function LimitesCard({ c }: { c: CuentaPantalla }) {
  return (
    <Card>
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <SlidersHorizontal size={14} /> Limites operativos
      </h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        Configurados por {brand.company.shortName}. Para modificarlos contacta a tu ejecutivo.
      </p>
      <div className="space-y-2 text-sm">
        <Fila
          label="Monto max. por transferencia"
          value={formatMoney(c.cliente?.limite_transferencia, { decimals: 0 })}
        />
        <Fila label="Operaciones diarias" value={c.cliente?.limite_ops_diarias ?? "—"} />
        <Fila
          label="Monto acumulado diario"
          value={formatMoney(c.cliente?.limite_monto_diario, { decimals: 0 })}
        />
        <Fila label="Horario operativo" value={<>06:00 &ndash; 23:00</>} />
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground border-t pt-2">
        Ultima actualizacion: 01/06/2026 por equipo {brand.company.shortName}
      </div>
    </Card>
  );
}

/** Columna derecha de "Mi cuenta": CVU, plan, constancia, facturación, representantes y límites. */
export function CuentaSidebar({
  c,
  onConstancia,
}: {
  c: CuentaPantalla;
  onConstancia: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Landmark size={16} className="shrink-0 text-primary-ink" />
          Informacion de CVU
        </h3>
        <div className="text-xs space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">CVU</span>
            <span className="font-mono font-semibold truncate">{c.cbu.cbu}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Alias</span>
            <span className="font-mono font-semibold truncate">{c.cbu.alias}</span>
          </div>
        </div>
      </Card>

      <PlanCard c={c} />

      <Card>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-semibold text-sm flex items-center gap-2 min-w-0">
            <Landmark size={16} className="shrink-0 text-primary-ink" />
            <span className="truncate">Constancia de CBU</span>
          </h3>
          <Badge tone="success">Oficial</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Documento oficial con razon social{c.isPJ ? ", CUIT" : ""}, CBU y alias.
        </p>
        <BtnPrimary className="w-full" onClick={onConstancia}>
          <Download size={14} /> Descargar constancia (PDF)
        </BtnPrimary>
      </Card>

      <Card>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <CreditCard size={16} /> Facturacion
        </h3>
        <div className="space-y-2 text-sm">
          <Fila label="Metodo de pago" value="Debito CVU" />
          <Fila label="Proxima factura" value="01/07/2026" />
          <Fila label="Monto estimado" value={c.plan.precio} />
        </div>
        <BtnOutline className="w-full mt-4">Ver historial de facturas</BtnOutline>
      </Card>

      {c.isPJ && (
        <Card>
          <h3 className="font-semibold text-sm mb-3">Representantes legales</h3>
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-semibold">
                {c.userNombre} {c.userApellido}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.dp.cuitCuil} &middot; Presidenta
              </div>
            </div>
            <div>
              <div className="font-semibold">Diego Mendez</div>
              <div className="text-xs text-muted-foreground">20-29888777-3 &middot; Apoderado</div>
            </div>
          </div>
        </Card>
      )}

      <LimitesCard c={c} />
    </div>
  );
}
