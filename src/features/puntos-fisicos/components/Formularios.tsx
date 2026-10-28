import { useEffect, useState } from "react";
import { Input, Label } from "@/components/portal-shell";
import type { Caja, CajaInput, Sucursal, SucursalInput } from "@/lib/api/puntos-fisicos";
import { parseMonto } from "@/shared/format";
import { FormDialog } from "@/shared/ui/form-dialog";

const selectCls = "mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm";

function Campo({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="mt-1"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const vacioSucursal = (s?: Sucursal | null): Required<Omit<SucursalInput, "id">> => ({
  nombre: s?.nombre ?? "",
  calle: s?.calle ?? "",
  ciudad: s?.ciudad ?? "",
  estado_region: s?.estado_region ?? "",
  codigo_postal: s?.codigo_postal ?? "",
  telefono: s?.telefono ?? "",
  email: s?.email ?? "",
  encargado: s?.encargado ?? "",
  estado: s?.estado ?? "activa",
});

/** Alta / edición de sucursal. */
export function SucursalDialog({
  open,
  sucursal,
  onClose,
  onGuardar,
  guardando,
}: {
  open: boolean;
  sucursal: Sucursal | null;
  onClose: () => void;
  onGuardar: (s: SucursalInput) => void;
  guardando: boolean;
}) {
  const [f, setF] = useState(vacioSucursal(sucursal));
  useEffect(() => setF(vacioSucursal(sucursal)), [sucursal, open]);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={sucursal ? "Editar sucursal" : "Nueva sucursal"}
      description="Se crea también en tu cuenta de Ecart Pay."
      submitLabel={guardando ? "Guardando…" : sucursal ? "Guardar" : "Crear"}
      isSubmitting={guardando}
      onSubmit={() => onGuardar({ ...f, id: sucursal?.id })}
      size="lg"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Campo id="suc-nombre" label="Nombre" value={f.nombre} onChange={set("nombre")} />
        </div>
        <div className="sm:col-span-2">
          <Campo id="suc-calle" label="Calle y número" value={f.calle} onChange={set("calle")} />
        </div>
        <Campo id="suc-ciudad" label="Ciudad" value={f.ciudad} onChange={set("ciudad")} />
        <Campo
          id="suc-estado-region"
          label="Estado"
          value={f.estado_region}
          onChange={set("estado_region")}
        />
        <Campo
          id="suc-cp"
          label="Código postal"
          value={f.codigo_postal}
          onChange={set("codigo_postal")}
        />
        <Campo id="suc-tel" label="Teléfono" value={f.telefono} onChange={set("telefono")} />
        <Campo id="suc-email" label="Email" type="email" value={f.email} onChange={set("email")} />
        <Campo
          id="suc-encargado"
          label="Encargado"
          value={f.encargado}
          onChange={set("encargado")}
        />
        <div>
          <Label htmlFor="suc-estado">Estado de la sucursal</Label>
          <select
            id="suc-estado"
            className={selectCls}
            value={f.estado}
            onChange={(e) => set("estado")(e.target.value)}
          >
            <option value="activa">Activa</option>
            <option value="pausada">Pausada</option>
            <option value="inactiva">Inactiva</option>
          </select>
        </div>
      </div>
    </FormDialog>
  );
}

type FormCaja = {
  nombre: string;
  numero: string;
  estado: string;
  permite_reembolsos: boolean;
  tope_reembolso: string;
  requiere_aprobacion: boolean;
  umbral_aprobacion: string;
  copias_ticket: string;
};

const vacioCaja = (c?: Caja | null): FormCaja => ({
  nombre: c?.nombre ?? "",
  numero: c?.numero ?? "",
  estado: c?.estado ?? "activa",
  permite_reembolsos: c?.permite_reembolsos ?? false,
  tope_reembolso: c?.tope_reembolso != null ? String(c.tope_reembolso) : "",
  requiere_aprobacion: c?.requiere_aprobacion ?? false,
  umbral_aprobacion: c?.umbral_aprobacion != null ? String(c.umbral_aprobacion) : "",
  copias_ticket: String(c?.copias_ticket ?? 1),
});

/** Alta / edición de caja dentro de una sucursal. */
export function CajaDialog({
  open,
  sucursalId,
  caja,
  onClose,
  onGuardar,
  guardando,
}: {
  open: boolean;
  sucursalId: string | null;
  caja: Caja | null;
  onClose: () => void;
  onGuardar: (c: CajaInput) => void;
  guardando: boolean;
}) {
  const [f, setF] = useState(vacioCaja(caja));
  useEffect(() => setF(vacioCaja(caja)), [caja, open]);
  const monto = (v: string) => (v.trim() ? parseMonto(v) : null);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={caja ? "Editar caja" : "Nueva caja"}
      description="Se crea también en tu cuenta de Ecart Pay."
      submitLabel={guardando ? "Guardando…" : caja ? "Guardar" : "Crear"}
      isSubmitting={guardando}
      onSubmit={() =>
        onGuardar({
          id: caja?.id,
          sucursal_id: caja ? undefined : (sucursalId ?? undefined),
          nombre: f.nombre,
          numero: f.numero,
          estado: f.estado,
          permite_reembolsos: f.permite_reembolsos,
          tope_reembolso: f.permite_reembolsos ? monto(f.tope_reembolso) : null,
          requiere_aprobacion: f.requiere_aprobacion,
          umbral_aprobacion: f.requiere_aprobacion ? monto(f.umbral_aprobacion) : null,
          copias_ticket: Number(f.copias_ticket) || 1,
        })
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Campo
          id="caja-nombre"
          label="Nombre"
          value={f.nombre}
          onChange={(v) => setF({ ...f, nombre: v })}
        />
        <Campo
          id="caja-numero"
          label="Número"
          value={f.numero}
          onChange={(v) => setF({ ...f, numero: v })}
        />
        <div>
          <Label htmlFor="caja-estado">Estado</Label>
          <select
            id="caja-estado"
            className={selectCls}
            value={f.estado}
            onChange={(e) => setF({ ...f, estado: e.target.value })}
          >
            <option value="activa">Activa</option>
            <option value="mantenimiento">En mantenimiento</option>
            <option value="inactiva">Inactiva</option>
          </select>
        </div>
        <div>
          <Label htmlFor="caja-copias">Copias de ticket</Label>
          <select
            id="caja-copias"
            className={selectCls}
            value={f.copias_ticket}
            onChange={(e) => setF({ ...f, copias_ticket: e.target.value })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={f.permite_reembolsos}
            onChange={(e) => setF({ ...f, permite_reembolsos: e.target.checked })}
          />
          Permite reembolsos
        </label>
        {f.permite_reembolsos && (
          <Campo
            id="caja-tope"
            label="Tope de reembolso (opcional)"
            value={f.tope_reembolso}
            onChange={(v) => setF({ ...f, tope_reembolso: v })}
          />
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={f.requiere_aprobacion}
            onChange={(e) => setF({ ...f, requiere_aprobacion: e.target.checked })}
          />
          Requiere aprobación del gerente
        </label>
        {f.requiere_aprobacion && (
          <Campo
            id="caja-umbral"
            label="A partir de qué monto (opcional)"
            value={f.umbral_aprobacion}
            onChange={(v) => setF({ ...f, umbral_aprobacion: v })}
          />
        )}
      </div>
    </FormDialog>
  );
}
