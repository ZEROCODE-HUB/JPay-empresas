import { useRef } from "react";
import { ArrowLeft, ArrowRight, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary, Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import type { FilaCarga } from "../../carga";
import { PaginacionSimple } from "../../components/PaginacionSimple";
import { descargarPlantilla } from "../../export";
import type { usePaginaLocal } from "../../hooks/usePaginaLocal";

type Pagina = ReturnType<typeof usePaginaLocal<FilaCarga>>;

function VistaPrevia({ filas, pag }: { filas: FilaCarga[]; pag: Pagina }) {
  return (
    <>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-3 py-2 font-semibold">Entidad</th>
              <th className="text-left px-3 py-2 font-semibold">Usuario</th>
              <th className="text-right px-3 py-2 font-semibold">Monto</th>
              <th className="text-left px-3 py-2 font-semibold">Descripcion</th>
              <th className="text-left px-3 py-2 font-semibold">Email</th>
              <th className="text-left px-3 py-2 font-semibold">Venc. 1</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pag.visibles.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  {r.tipo_entidad} {r.id_entidad} - {r.sub_entidad}
                </td>
                <td className="px-3 py-2">{r.identificacion_usuario}</td>
                <td className="px-3 py-2 font-mono tabular-nums text-right font-medium">
                  {formatMoney(r.monto)}
                </td>
                <td className="px-3 py-2 max-w-[150px] truncate">{r.descripcion}</td>
                <td className="px-3 py-2">{r.email ?? "-"}</td>
                <td className="px-3 py-2">{r.fecha_vencimiento_1?.slice(0, 10) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginacionSimple
        className="flex items-center justify-between text-xs text-muted-foreground pt-2"
        page={pag.page}
        pageSize={pag.pageSize}
        total={filas.length}
        totalPages={pag.totalPages}
        onAnterior={pag.anterior}
        onSiguiente={pag.siguiente}
      />
    </>
  );
}

/** Paso 2: plantilla, subida del archivo (clic o arrastrar) y vista previa paginada. */
export function CargaArchivoPaso({
  filas,
  pag,
  nombreArchivo,
  subiendo,
  onArchivo,
  onLimpiar,
  onAnterior,
  onSiguiente,
}: {
  filas: FilaCarga[];
  /** Paginación de la vista previa (vive en la pantalla para no reiniciarse al cambiar de paso). */
  pag: Pagina;
  nombreArchivo: string;
  subiendo: boolean;
  onArchivo: (f: File) => void;
  onLimpiar: () => void;
  onAnterior: () => void;
  onSiguiente: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold mb-3">Carga de archivo</h3>
        <div className="text-sm text-muted-foreground mb-4 space-y-1">
          <p>
            Campos obligatorios:{" "}
            <strong>
              tipo_entidad, id_entidad, sub_entidad, identificacion_usuario, monto, descripcion
            </strong>
          </p>
          <p>
            Campos opcionales: email, periodo_facturacion, id_unico_beneficiario,
            fecha_vencimiento_1/2/3, tasa_interes, medios_de_pago, pagos_parciales_habilitado
          </p>
          <p>
            Si no se completan los campos opcionales, heredan la configuracion general del lote.
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          <BtnOutline
            className="h-9 px-3 text-xs"
            onClick={() => {
              descargarPlantilla("nuevo");
              toast.success("Plantilla descargada");
            }}
          >
            <Download size={14} /> Descargar plantilla CSV
          </BtnOutline>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onArchivo(f);
          }}
        />

        {filas.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 p-8 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/30 transition"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onArchivo(f);
            }}
          >
            <div className="w-14 h-14 rounded-lg bg-[color:var(--brand-primary-50)] flex items-center justify-center">
              <Upload size={24} className="text-[color:var(--brand-primary-700)]" />
            </div>
            <div className="text-center">
              <div className="font-semibold">Subi un archivo CSV</div>
              <div className="text-xs text-muted-foreground">
                Arrastra el archivo o hace clic para seleccionar
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
              <FileSpreadsheet size={20} className="text-emerald-600" />
              <div className="flex-1">
                <div className="font-semibold text-sm">{nombreArchivo}</div>
                <div className="text-xs text-muted-foreground">
                  {filas.length} registros parseados correctamente
                </div>
              </div>
              <button onClick={onLimpiar} className="p-1 rounded hover:bg-emerald-100 transition">
                <X size={16} />
              </button>
            </div>
            <VistaPrevia filas={filas} pag={pag} />
          </div>
        )}
      </Card>

      <div className="flex justify-between gap-2">
        <BtnOutline onClick={onAnterior}>
          <ArrowLeft size={14} /> Anterior
        </BtnOutline>
        <BtnPrimary
          disabled={filas.length === 0 || subiendo}
          onClick={() => {
            if (filas.length === 0) {
              toast.error("Debes cargar al menos un registro");
              return;
            }
            onSiguiente();
          }}
        >
          Siguiente <ArrowRight size={14} />
        </BtnPrimary>
      </div>
    </div>
  );
}
