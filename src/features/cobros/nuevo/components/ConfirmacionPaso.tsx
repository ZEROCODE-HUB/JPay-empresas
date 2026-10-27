import { ArrowLeft, Check } from "lucide-react";
import { BtnOutline, BtnPrimary, Card } from "@/components/portal-shell";
import { medioPagoLabels } from "@/lib/api/cobros-masivos";
import { formatMoney } from "@/shared/format";
import { montoTotalFilas, type FilaCarga } from "../../carga";
import type { ParametrosLote } from "../../utils";

function Dato({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

/** Paso 3: resumen de parámetros y registros antes de crear el lote. */
export function ConfirmacionPaso({
  p,
  filas,
  guardando,
  onAnterior,
  onCrear,
}: {
  p: ParametrosLote;
  filas: FilaCarga[];
  guardando: boolean;
  onAnterior: () => void;
  onCrear: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold mb-4">Resumen del lote</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <Dato label="Nombre:" value={p.nombre} />
          <Dato label="Periodo:" value={p.periodo} />
          <Dato label="Dia de pago:" value={`Cada mes, dia ${p.diaProcesamiento}`} />
          <Dato label="Tasa de interes:" value={`${p.tasaInteres}% (desde 2º vencimiento)`} />
          <Dato label="1er vencimiento:" value={p.fechaVenc1} />
          <Dato label="2do vencimiento:" value={p.fechaVenc2 || "No configurado"} />
          <Dato label="3er vencimiento:" value={p.fechaVenc3 || "No configurado"} />
          <Dato
            label="Pagos parciales:"
            value={p.pagosParciales ? "Habilitados" : "Deshabilitados"}
          />
          <Dato
            label="Notificaciones:"
            value={p.notificaciones ? "Habilitadas" : "Deshabilitadas"}
          />
          <Dato
            label="Medios de pago:"
            value={p.mediosPago.map((m) => medioPagoLabels[m]).join(", ")}
          />
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-4">Registros cargados</h3>
        <div className="text-sm">
          <span className="font-display tabular-nums font-semibold text-lg">{filas.length}</span>{" "}
          <span className="text-muted-foreground">registros</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Monto total estimado:{" "}
          <strong className="font-mono tabular-nums text-foreground">
            {formatMoney(montoTotalFilas(filas))}
          </strong>
        </div>
      </Card>

      <div className="flex justify-between gap-2">
        <BtnOutline onClick={onAnterior}>
          <ArrowLeft size={14} /> Anterior
        </BtnOutline>
        <BtnPrimary onClick={onCrear} disabled={guardando}>
          <Check size={14} /> {guardando ? "Guardando..." : "Crear lote"}
        </BtnPrimary>
      </div>
    </div>
  );
}
