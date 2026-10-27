import { FileText, User } from "lucide-react";
import { Badge, Card, Input, Label } from "@/components/portal-shell";
import { siguientePasoOnboarding } from "@/lib/cliente-estados";
import { ESTADO_CUENTA_TONE } from "../estados";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";
import { BotonesGuardar } from "./BotonesGuardar";

export function InfoUsuarioCard({ c }: { c: CuentaPantalla }) {
  const { form, setF, dp } = c;
  return (
    <Card>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <User size={16} /> Informacion del Usuario
      </h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Nombre</Label>
          <Input
            value={form.nombre ?? c.userNombre}
            onChange={(e) => setF("nombre", e.target.value)}
          />
        </div>
        <div>
          <Label>Apellido</Label>
          <Input
            value={form.apellido ?? c.userApellido}
            onChange={(e) => setF("apellido", e.target.value)}
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input value={c.userEmail} readOnly />
        </div>
        <div>
          <Label>Estado</Label>
          <div className="pt-1.5 flex flex-col gap-1">
            <Badge tone={ESTADO_CUENTA_TONE[c.estadoNorm]}>{c.estadoLabel}</Badge>
            <span className="text-[10px] text-muted-foreground">
              {siguientePasoOnboarding(c.estadoNorm)}
            </span>
          </div>
        </div>
      </div>
      <hr className="my-4 border-border" />
      <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
        <FileText size={14} /> Datos personales
      </h4>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>CUIL / CUIT</Label>
          <Input
            value={form.cuit_cuil ?? dp.cuitCuil}
            onChange={(e) => setF("cuit_cuil", e.target.value)}
          />
        </div>
        <div>
          <Label>DNI</Label>
          {/* `clientes` no tiene columna de DNI: no hay dato real que mostrar. */}
          <Input value="—" readOnly />
        </div>
        <div>
          <Label>Genero</Label>
          <select
            className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            value={form.genero ?? dp.genero}
            onChange={(e) => setF("genero", e.target.value)}
          >
            <option>{form.genero ?? dp.genero}</option>
          </select>
        </div>
        <div>
          <Label>Nacimiento</Label>
          <Input
            type="date"
            value={form.fecha_nacimiento ?? c.userNac}
            onChange={(e) => setF("fecha_nacimiento", e.target.value)}
          />
        </div>
        <div>
          <Label>Ocupacion</Label>
          <Input
            value={form.ocupacion ?? dp.ocupacion}
            onChange={(e) => setF("ocupacion", e.target.value)}
          />
        </div>
        <div>
          <Label>Fuente de Fondos</Label>
          <select
            className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            value={form.origen_fondos ?? dp.origenFondos}
            onChange={(e) => setF("origen_fondos", e.target.value)}
          >
            <option>{form.origen_fondos ?? dp.origenFondos}</option>
          </select>
        </div>
        <div>
          <Label>PEP</Label>
          <div className="pt-1.5 text-sm">{dp.esPEP ? "Si" : "No"}</div>
        </div>
      </div>
      <BotonesGuardar c={c} className="flex gap-2 justify-end mt-4" />
    </Card>
  );
}
