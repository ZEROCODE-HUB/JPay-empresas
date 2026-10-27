import { useState } from "react";
import { Edit3, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import { formatMoney } from "@/shared/format";
import type { Template } from "@/lib/api/transferencias";
import type { PlantillaInput, Subcuenta } from "../types";
import { CONCEPTO_DEFAULT, parseMontoPlantilla } from "../utils";
import { ConceptoSelect } from "./campos";

/**
 * Templates dialog: list, apply, create, edit and delete. Templates are generic
 * (name + amount, no recipient): the CBU/CVU/alias is chosen when applying them.
 */
export function PlantillasDialog({
  open,
  onClose,
  templates,
  error,
  subcuentas,
  onAplicar,
  onBorrar,
  onCrear,
  onEditar,
}: {
  open: boolean;
  onClose: () => void;
  templates: Template[];
  /** Shown when the table does not exist yet (migration 1016). */
  error?: string | null;
  subcuentas: Subcuenta[];
  onAplicar: (p: Template) => void;
  onBorrar: (p: Template) => void | Promise<void>;
  onCrear: (input: PlantillaInput) => Promise<boolean>;
  onEditar: (id: string, input: PlantillaInput) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [subcuentaOrigen, setSubcuentaOrigen] = useState("");
  const [concepto, setConcepto] = useState(CONCEPTO_DEFAULT);
  const [creando, setCreando] = useState(false);
  /** Template being edited (null = creating a new one). */
  const [editando, setEditando] = useState<Template | null>(null);

  const guardar = async () => {
    if (creando) return;
    if (!nombre.trim()) {
      toast.error("Ponele un nombre a la plantilla");
      return;
    }
    const montoNum = parseMontoPlantilla(monto);
    if (montoNum === null) {
      toast.error("Ingresa un monto valido o dejalo vacio");
      return;
    }
    setCreando(true);
    try {
      const datos = {
        nombre: nombre.trim(),
        monto: montoNum,
        subcuentaOrigen: subcuentaOrigen || undefined,
        concepto: concepto || undefined,
      };
      const ok = editando ? await onEditar(editando.id, datos) : await onCrear(datos);
      if (ok) {
        setNombre("");
        setMonto("");
        setSubcuentaOrigen("");
        setConcepto(CONCEPTO_DEFAULT);
        setEditando(null);
      }
    } finally {
      setCreando(false);
    }
  };

  const empezarEdicion = (p: Template) => {
    setEditando(p);
    setNombre(p.nombre);
    setMonto(p.monto != null ? String(p.monto) : "");
    setSubcuentaOrigen(p.subcuentaOrigen ?? "");
    setConcepto(p.concepto || CONCEPTO_DEFAULT);
  };

  return (
    <FormDialog
      open={open}
      onClose={() => {
        setEditando(null);
        setNombre("");
        setMonto("");
        setSubcuentaOrigen("");
        onClose();
      }}
      title="Plantillas de transferencia"
      description="Selecciona una plantilla para precargar el formulario."
      submitLabel={creando ? "Guardando..." : editando ? "Guardar cambios" : "Crear plantilla"}
      size="lg"
      onSubmit={() => {
        void guardar();
      }}
    >
      {error && (
        <div className="mb-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}
      <div className="divide-y border rounded-md max-h-64 overflow-y-auto">
        {templates.length === 0 ? (
          <div className="p-5 text-center text-sm text-muted-foreground">
            Todavia no tenes templates. Crea una abajo o guardala desde el formulario de
            transferencia.
          </div>
        ) : (
          templates.map((p) => {
            const origen = p.subcuentaOrigen
              ? subcuentas.find((s) => s.id === p.subcuentaOrigen)?.nombre
              : undefined;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 p-3 hover:bg-muted/50 cursor-pointer"
                onClick={() => onAplicar(p)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-md bg-[color:var(--brand-primary-50)] flex items-center justify-center shrink-0">
                    <Star size={14} className="text-[color:var(--brand-primary-700)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.nombre}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.destinatario
                        ? `${p.destinatario.nombre}${p.destinatario.alias ? ` · @${p.destinatario.alias}` : ""}`
                        : p.monto != null
                          ? formatMoney(p.monto)
                          : "Sin monto"}
                      {p.concepto ? ` · ${p.concepto}` : ""}
                      {origen ? ` · ${origen}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold">
                    {p.monto != null ? formatMoney(p.monto) : "—"}
                  </span>
                  <button
                    type="button"
                    title="Editar plantilla"
                    onClick={(e) => {
                      e.stopPropagation();
                      empezarEdicion(p);
                    }}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent text-muted-foreground"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    title="Eliminar plantilla"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onBorrar(p);
                    }}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 text-muted-foreground hover:text-danger-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="pt-3 space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{editando ? "Nombre" : "Nueva plantilla"}</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Sueldos mensuales"
            />
          </div>
          <div>
            <Label>Monto ($)</Label>
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Ej. 482000"
              inputMode="decimal"
            />
          </div>
          <div>
            <Label>Origen de fondos (opcional)</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={subcuentaOrigen}
              onChange={(e) => setSubcuentaOrigen(e.target.value)}
            >
              <option value="">Sin especificar</option>
              {subcuentas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {formatMoney(Number(s.saldo_disponible))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Concepto</Label>
            <ConceptoSelect value={concepto} onChange={setConcepto} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Al usar la template se precargan el monto, el concepto y el origen. El destinatario
          (CBU/CVU/alias) lo elegis en ese momento.
        </p>
      </div>
    </FormDialog>
  );
}
