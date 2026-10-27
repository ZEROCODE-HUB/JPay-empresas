import { Building2, Landmark } from "lucide-react";
import { Card, Input, Label } from "@/components/portal-shell";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";
import type { CampoTexto } from "../types";
import { BotonesGuardar } from "./BotonesGuardar";

function Campo({
  c,
  label,
  campo,
  fallback,
  type,
  className,
}: {
  c: CuentaPantalla;
  label: string;
  campo: CampoTexto;
  fallback: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input
        type={type}
        value={c.form[campo] ?? fallback}
        onChange={(e) => c.setF(campo, e.target.value)}
      />
    </div>
  );
}

/** Dirección, ciudad, provincia y código postal (PF y PJ). */
export function InfoAdicionalCard({ c }: { c: CuentaPantalla }) {
  const { dir } = c;
  return (
    <Card>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Landmark size={16} /> Informacion adicional
      </h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <Campo
          c={c}
          label="Direccion"
          campo="direccion"
          fallback={dir.direccion}
          className="sm:col-span-2"
        />
        <Campo c={c} label="Ciudad" campo="ciudad" fallback={dir.ciudad} />
        <Campo c={c} label="Provincia" campo="provincia" fallback={dir.provincia} />
        <Campo c={c} label="Codigo Postal" campo="cp" fallback={dir.cp} />
        <BotonesGuardar c={c} className="sm:col-span-2 flex gap-2 justify-end" />
      </div>
    </Card>
  );
}

/** Datos societarios (solo PJ). */
export function InfoEmpresaCard({ c }: { c: CuentaPantalla }) {
  const { empresaInfo } = c;
  return (
    <Card>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Building2 size={16} /> Informacion de la Empresa
      </h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <Campo c={c} label="Nombre Legal" campo="nombreLegal" fallback={empresaInfo.nombreLegal} />
        <Campo
          c={c}
          label="Nombre Comercial"
          campo="nombreFantasia"
          fallback={empresaInfo.nombreFantasia}
        />
        <Campo c={c} label="CUIT" campo="cuit" fallback={empresaInfo.cuit} />
        <div>
          <Label>Tipo de sociedad</Label>
          <select
            className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            value={c.form.tipo_sociedad ?? empresaInfo.tipoId}
            onChange={(e) => c.setF("tipo_sociedad", e.target.value)}
          >
            <option>{c.form.tipo_sociedad ?? empresaInfo.tipoId}</option>
          </select>
        </div>
        <Campo
          c={c}
          label="Actividad principal"
          campo="actividad"
          fallback="Servicios financieros"
        />
        <Campo
          c={c}
          label="Fecha de inscripcion"
          campo="fecha_inscripcion"
          fallback={empresaInfo.fechaInscripcion}
          type="date"
        />
        <Campo c={c} label="Telefono" campo="telefono" fallback="" />
        <BotonesGuardar c={c} className="sm:col-span-2 flex gap-2 justify-end" />
      </div>
    </Card>
  );
}
