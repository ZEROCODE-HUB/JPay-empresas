import { Activity, Shield, TrendingUp, User } from "lucide-react";
import { formatNumber } from "@/shared/format";
import { InfoTip } from "@/shared/ui/info-tip";
import { Cargando } from "@/shared/ui/estado-carga";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";
import { labelKyc } from "../utils";
import { brand } from "@/brand/brand";

export function CuentaStats({ c }: { c: CuentaPantalla }) {
  const stats = [
    {
      icon: Shield,
      label: "Estado KYC",
      value: labelKyc(c.aprobado, c.cliente?.estado_onboarding),
      sub: c.aprobado ? "Verificado" : "En revisión",
      info: `Estado de la verificación de identidad de tu cuenta: «Validado» cuando ${brand.name} aprobó tu alta; si no, sigue pendiente o fue rechazada.`,
    },
    {
      icon: Activity,
      label: "Transacciones mes",
      value: formatNumber(c.movCount),
      cargando: c.cargandoResumen,
      info: `Operaciones confirmadas en tu cuenta ${brand.name} desde el día 1 del mes en curso (depósitos, envíos y conversiones). No cuenta las rechazadas ni las que siguen en proceso; una conversión cuenta una vez.`,
    },
    {
      icon: User,
      label: "Antigüedad",
      value: c.antiguedad,
      info: `Tiempo desde la fecha de alta de tu cuenta en ${brand.name}.`,
    },
    {
      icon: TrendingUp,
      label: "Score de seguridad",
      value: c.score === null ? "—" : `${c.score} / 100`,
      sub: "Recomendado: 80+",
      info: "Puntaje de qué tan completa está tu ficha: parte de 55 y suma por cuenta validada (+20), dirección (+8), teléfono (+7) y documentos cargados (hasta +10). No es una calificación de riesgo.",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
      {stats.map((s, i) => (
        <div key={s.label} className="bg-card border rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
            <s.icon size={12} className="shrink-0" />
            {s.label}
            {/* Las impares quedan a la derecha (columna derecha en el celular, última en escritorio). */}
            <InfoTip align={i % 2 === 1 ? "right" : "left"}>{s.info}</InfoTip>
          </div>
          <div className="font-display tabular-nums text-sm font-semibold mt-0.5">
            {c.cargando || ("cargando" in s && s.cargando) ? (
              <Cargando className="h-4 w-16" />
            ) : (
              s.value
            )}
          </div>
          {s.sub && !c.cargando && <div className="text-[9px] text-muted-foreground">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}
