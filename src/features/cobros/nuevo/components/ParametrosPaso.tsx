import { ArrowRight } from "lucide-react";
import { BtnOutline, BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { medioPagoLabels, type MedioPago } from "@/lib/api/cobros-masivos";
import type { ParametrosLote } from "../../utils";

const MEDIOS_DISPONIBLES: MedioPago[] = [
  "TRANSFERENCIA",
  "TARJETA_CREDITO",
  "TARJETA_DEBITO",
  "QR",
];

/** Paso 1: nombre, período, día de pago, tasa, vencimientos y medios de pago. */
export function ParametrosPaso({
  p,
  set,
  toggleMedio,
  onCancelar,
  onSiguiente,
}: {
  p: ParametrosLote;
  set: <K extends keyof ParametrosLote>(k: K, v: ParametrosLote[K]) => void;
  toggleMedio: (m: MedioPago) => void;
  onCancelar: () => void;
  onSiguiente: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold mb-4">Parametros generales</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Nombre del lote</Label>
            <Input
              placeholder="Ej. Expensas Abril 2026"
              value={p.nombre}
              onChange={(e) => set("nombre", e.target.value)}
            />
          </div>
          <div>
            <Label>Periodo</Label>
            <Input
              type="month"
              value={p.periodo}
              onChange={(e) => set("periodo", e.target.value)}
            />
          </div>
          <div>
            <Label>Dia de pago</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={p.diaProcesamiento}
              onChange={(e) => set("diaProcesamiento", Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Dia del mes en que se procesaran los cobros (1-31).
            </p>
          </div>
          <div>
            <Label>Tasa de interes (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={p.tasaInteres}
              onChange={(e) => set("tasaInteres", Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Aplica desde el 2º vencimiento en adelante.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-4">Fechas de vencimiento</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>1er vencimiento *</Label>
            <Input
              type="date"
              value={p.fechaVenc1}
              onChange={(e) => set("fechaVenc1", e.target.value)}
            />
          </div>
          <div>
            <Label>2do vencimiento (opcional)</Label>
            <Input
              type="date"
              value={p.fechaVenc2}
              onChange={(e) => set("fechaVenc2", e.target.value)}
            />
          </div>
          <div>
            <Label>3er vencimiento (opcional)</Label>
            <Input
              type="date"
              value={p.fechaVenc3}
              onChange={(e) => set("fechaVenc3", e.target.value)}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Cada fecha debe ser estrictamente posterior a la anterior. El 1er vencimiento se cobra por
          el monto original, el 2do y 3ro aplican la tasa de interes.
        </p>
      </Card>

      <Card>
        <h3 className="font-semibold mb-4">Medios de pago y configuracion</h3>
        <div className="space-y-4">
          <div>
            <Label>Medios de pago habilitados</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {MEDIOS_DISPONIBLES.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleMedio(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    p.mediosPago.includes(m)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-input hover:border-foreground/30"
                  }`}
                >
                  {medioPagoLabels[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={p.pagosParciales}
                onChange={(e) => set("pagosParciales", e.target.checked)}
                className="rounded"
              />
              Permitir pagos parciales
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={p.notificaciones}
                onChange={(e) => set("notificaciones", e.target.checked)}
                className="rounded"
              />
              Habilitar notificaciones
            </label>
          </div>
          {p.notificaciones && (
            <div className="text-xs text-muted-foreground pl-6">
              Canal: Email (SMS y WhatsApp proximamente)
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <BtnOutline onClick={onCancelar}>Cancelar</BtnOutline>
        <BtnPrimary onClick={onSiguiente}>
          Siguiente <ArrowRight size={14} />
        </BtnPrimary>
      </div>
    </div>
  );
}
