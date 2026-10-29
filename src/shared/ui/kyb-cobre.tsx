/**
 * Formulario de los datos KYB que pide Cobre para dar de alta al comercio como Subcliente:
 * teléfono, sitio web, industria, países de constitución y operación, representantes legales y
 * beneficiarios finales. Lo usan el portal (Mi cuenta) y el admin (detalle del cliente); cada uno
 * le pasa los datos y las funciones para guardarlos.
 *
 * Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge, BtnOutline, BtnPrimary, Input, Label } from "@/components/portal-shell";
import {
  INDUSTRIAS_COBRE,
  MAX_PERSONAS_KYB,
  nombrePais,
  normalizarSitioWeb,
  PAISES_ISO3,
  validarPersonaKyb,
  type PersonaKyb,
  type RolKyb,
} from "../cobre-kyb";

export type EmpresaKyb = {
  telefono: string;
  sitioWeb: string;
  industria: string;
  paisConstitucion: string;
  paisOperacion: string;
};

type Props = {
  empresa: EmpresaKyb;
  personas: PersonaKyb[];
  /** Lo que todavía falta para el alta (lo calcula el servidor). */
  faltan?: string[];
  /** Con el alta ya enviada o aprobada, los datos no se cambian desde acá. */
  soloLectura?: boolean;
  onGuardarEmpresa: (e: EmpresaKyb) => Promise<void>;
  onGuardarPersona: (p: PersonaKyb) => Promise<void>;
  onBorrarPersona: (id: string) => Promise<void>;
  onError: (mensaje: string) => void;
};

const select = "mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm";
const vacia = (rol: RolKyb): PersonaKyb => ({
  rol,
  nombre: "",
  apellido: "",
  idTipo: "rfc",
  idNumero: "",
  nacionalidades: ["MEX"],
  fechaNacimiento: "",
  porcentaje: rol === "beneficiario" ? 25 : null,
});

export function KybCobreForm(p: Props) {
  const [empresa, setEmpresa] = useState<EmpresaKyb>(p.empresa);
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState<PersonaKyb | null>(null);

  const guardarEmpresa = async () => {
    const web = normalizarSitioWeb(empresa.sitioWeb);
    if (!web) return p.onError("Ingresá un sitio web válido");
    if (!/^\+\d{10,15}$/.test(empresa.telefono.replace(/[\s-]/g, ""))) {
      return p.onError("El teléfono va con código de país, por ejemplo +52 55 1234 5678");
    }
    if (!empresa.industria) return p.onError("Elegí la industria");
    setGuardando(true);
    try {
      await p.onGuardarEmpresa({
        ...empresa,
        sitioWeb: web,
        telefono: empresa.telefono.replace(/[\s-]/g, ""),
      });
    } catch (e) {
      p.onError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const guardarPersona = async () => {
    if (!nueva) return;
    const err = validarPersonaKyb(nueva);
    if (err) return p.onError(err);
    setGuardando(true);
    try {
      await p.onGuardarPersona({ ...nueva, idNumero: nueva.idNumero.trim().toUpperCase() });
      setNueva(null);
    } catch (e) {
      p.onError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const lista = (rol: RolKyb, titulo: string, ayuda: string) => {
    const filas = p.personas.filter((x) => x.rol === rol);
    return (
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{titulo}</p>
          {!p.soloLectura && filas.length < MAX_PERSONAS_KYB[rol] && (
            <button
              type="button"
              className="text-xs font-semibold text-secondary hover:underline"
              onClick={() => setNueva(vacia(rol))}
            >
              Agregar
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
        {filas.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Sin cargar.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {filas.map((x) => (
              <li key={x.id} className="py-2 flex items-center justify-between gap-3">
                <span>
                  {x.nombre} {x.apellido}{" "}
                  <span className="text-xs text-muted-foreground">
                    {x.idTipo.toUpperCase()} {x.idNumero} ·{" "}
                    {x.nacionalidades.map(nombrePais).join(", ")} · {x.fechaNacimiento}
                    {x.porcentaje != null && ` · ${x.porcentaje}%`}
                  </span>
                </span>
                {!p.soloLectura && x.id && (
                  <button
                    type="button"
                    title="Quitar"
                    className="text-muted-foreground hover:text-danger-600"
                    onClick={() =>
                      p.onBorrarPersona(x.id!).catch((e) => p.onError((e as Error).message))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div>
      {p.faltan && p.faltan.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-semibold">Falta completar para el alta en Cobre:</p>
          <ul className="mt-1 list-disc pl-4">
            {p.faltan.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="kyb-tel">Teléfono (con código de país)</Label>
          <Input
            id="kyb-tel"
            className="mt-1"
            placeholder="+52 55 1234 5678"
            disabled={p.soloLectura}
            value={empresa.telefono}
            onChange={(e) => setEmpresa({ ...empresa, telefono: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="kyb-web">Sitio web</Label>
          <Input
            id="kyb-web"
            className="mt-1"
            placeholder="www.tuempresa.mx"
            disabled={p.soloLectura}
            value={empresa.sitioWeb}
            onChange={(e) => setEmpresa({ ...empresa, sitioWeb: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="kyb-ind">Industria</Label>
          <select
            id="kyb-ind"
            className={select}
            disabled={p.soloLectura}
            value={empresa.industria}
            onChange={(e) => setEmpresa({ ...empresa, industria: e.target.value })}
          >
            <option value="">Elegí una industria</option>
            {INDUSTRIAS_COBRE.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        {(["paisConstitucion", "paisOperacion"] as const).map((k) => (
          <div key={k}>
            <Label htmlFor={`kyb-${k}`}>
              {k === "paisConstitucion" ? "País de constitución" : "País de operación"}
            </Label>
            <select
              id={`kyb-${k}`}
              className={select}
              disabled={p.soloLectura}
              value={empresa[k]}
              onChange={(e) => setEmpresa({ ...empresa, [k]: e.target.value })}
            >
              {PAISES_ISO3.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {!p.soloLectura && (
        <div className="mt-3 flex justify-end">
          <BtnOutline onClick={guardarEmpresa} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar datos de la empresa"}
          </BtnOutline>
        </div>
      )}

      {lista(
        "representante",
        "Representantes legales",
        "Quienes firman por la empresa (hasta 20).",
      )}
      {lista(
        "beneficiario",
        "Beneficiarios finales",
        "Personas con 25% o más de participación en la empresa (hasta 20).",
      )}

      {nueva && (
        <div className="mt-4 rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {nueva.rol === "representante"
                ? "Nuevo representante legal"
                : "Nuevo beneficiario final"}
            </p>
            <Badge tone="neutral">
              {nueva.rol === "representante" ? "Representante" : "Beneficiario"}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Input
              placeholder="Nombre(s)"
              value={nueva.nombre}
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
            />
            <Input
              placeholder="Apellidos"
              value={nueva.apellido}
              onChange={(e) => setNueva({ ...nueva, apellido: e.target.value })}
            />
            <div className="flex gap-2">
              <select
                className="h-10 rounded-md border border-input bg-card px-2 text-sm"
                value={nueva.idTipo}
                onChange={(e) => setNueva({ ...nueva, idTipo: e.target.value as "rfc" | "curp" })}
              >
                <option value="rfc">RFC</option>
                <option value="curp">CURP</option>
              </select>
              <Input
                placeholder={nueva.idTipo === "rfc" ? "RFC" : "CURP"}
                value={nueva.idNumero}
                onChange={(e) => setNueva({ ...nueva, idNumero: e.target.value })}
              />
            </div>
            <div>
              <Input
                type="date"
                aria-label="Fecha de nacimiento"
                value={nueva.fechaNacimiento}
                onChange={(e) => setNueva({ ...nueva, fechaNacimiento: e.target.value })}
              />
            </div>
            <select
              className="h-10 rounded-md border border-input bg-card px-2 text-sm"
              aria-label="Nacionalidad"
              value={nueva.nacionalidades[0] ?? "MEX"}
              onChange={(e) => setNueva({ ...nueva, nacionalidades: [e.target.value] })}
            >
              {PAISES_ISO3.map((x) => (
                <option key={x.value} value={x.value}>
                  Nacionalidad: {x.label}
                </option>
              ))}
            </select>
            {nueva.rol === "beneficiario" && (
              <Input
                inputMode="decimal"
                placeholder="% de participación"
                value={nueva.porcentaje ?? ""}
                onChange={(e) =>
                  setNueva({ ...nueva, porcentaje: e.target.value ? Number(e.target.value) : null })
                }
              />
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <BtnOutline onClick={() => setNueva(null)}>Cancelar</BtnOutline>
            <BtnPrimary onClick={guardarPersona} disabled={guardando}>
              {guardando ? "Guardando…" : "Agregar"}
            </BtnPrimary>
          </div>
        </div>
      )}
    </div>
  );
}
