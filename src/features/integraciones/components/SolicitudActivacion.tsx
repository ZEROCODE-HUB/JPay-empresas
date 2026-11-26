import { useEffect, useState } from "react";
import { CheckCircle2, Headset } from "lucide-react";
import { toast } from "sonner";
import { BtnOutline, Input, Label } from "@/components/portal-shell";
import { useClienteSesion } from "@/hooks/useCuenta";
import { useSolicitarContacto, useUltimaSolicitud } from "@/hooks/useSolicitudes";
import type { ServicioContacto } from "@/lib/api/solicitudes";
import { mensajeError } from "@/shared/errores";
import { formatDateTime } from "@/shared/format";
import { FormDialog } from "@/shared/ui/form-dialog";
import { brand } from "@/brand/brand";

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Props = {
  servicio: ServicioContacto;
  /** Comercio para el que se pide (clientes con varios comercios). */
  comercioId?: string | null;
  /** Texto del botón. */
  etiqueta?: string;
  /** Título y explicación del formulario. */
  titulo: string;
  descripcion: string;
  /** Ejemplo de qué escribir en el comentario. */
  ejemplo?: string;
};

/**
 * Botón «Contactar a soporte» + formulario corto, prellenado con los datos de la cuenta. La
 * solicitud llega al equipo de la plataforma (panel y correo). Si ya hay una abierta, la muestra
 * y deja corregirla en vez de duplicarla.
 */
export function SolicitudActivacion({
  servicio,
  comercioId,
  etiqueta = "Contactar a soporte",
  titulo,
  descripcion,
  ejemplo,
}: Props) {
  const { cliente } = useClienteSesion();
  const ultima = useUltimaSolicitud(servicio, comercioId);
  const enviar = useSolicitarContacto();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ nombre: "", telefono: "", correo: "", mensaje: "" });
  const [err, setErr] = useState<Record<string, string>>({});

  const s = ultima.data;
  const pendiente = s?.estado === "nueva";

  // Prellenado al abrir: la solicitud abierta (si hay) o los datos de la cuenta.
  useEffect(() => {
    if (!abierto) return;
    setErr({});
    if (s && s.estado === "nueva") {
      setF({ nombre: s.nombre, telefono: s.telefono, correo: s.correo, mensaje: s.mensaje ?? "" });
      return;
    }
    const c = (cliente ?? {}) as Record<string, unknown>;
    const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    setF({
      nombre: txt(c.nombre) || txt(c.nombre_fantasia) || txt(c.nombre_legal),
      telefono: txt(c.telefono),
      correo: txt(c.correo),
      mensaje: "",
    });
  }, [abierto, s, cliente]);

  const validar = () => {
    const e: Record<string, string> = {};
    if (f.nombre.trim().length < 2) e.nombre = "Escribe tu nombre";
    const digitos = f.telefono.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 13)
      e.telefono = "Escribe un teléfono de 10 dígitos";
    if (!CORREO.test(f.correo.trim())) e.correo = "Escribe un correo válido";
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const mandar = async () => {
    if (!validar()) return;
    try {
      await enviar.mutateAsync({
        servicio,
        comercioId,
        nombre: f.nombre.trim(),
        telefono: f.telefono.trim(),
        correo: f.correo.trim(),
        mensaje: f.mensaje.trim() || undefined,
      });
      toast.success(`¡Listo! Un ejecutivo de ${brand.name} te contactará pronto.`);
      setAbierto(false);
    } catch (e) {
      toast.error(mensajeError(e));
    }
  };

  const campo = (k: "nombre" | "telefono" | "correo") => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  });

  return (
    <>
      {pendiente ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-black-500">
            <CheckCircle2 size={16} className="text-success shrink-0" />
            Recibimos tu solicitud el {formatDateTime(s!.createdAt)}. Un ejecutivo te contactará
            pronto.
          </span>
          <button
            type="button"
            className="font-semibold text-secondary hover:underline"
            onClick={() => setAbierto(true)}
          >
            Corregir mis datos
          </button>
        </div>
      ) : (
        <BtnOutline type="button" onClick={() => setAbierto(true)}>
          <Headset size={16} /> {etiqueta}
        </BtnOutline>
      )}

      <FormDialog
        open={abierto}
        onClose={() => setAbierto(false)}
        title={titulo}
        description={descripcion}
        submitLabel={pendiente ? "Actualizar solicitud" : "Enviar solicitud"}
        isSubmitting={enviar.isPending}
        onSubmit={mandar}
      >
        <div>
          <Label htmlFor={`sol-${servicio}-nombre`}>Nombre</Label>
          <Input id={`sol-${servicio}-nombre`} autoComplete="name" {...campo("nombre")} />
          {err.nombre && <p className="mt-1 text-xs text-danger-600">{err.nombre}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`sol-${servicio}-telefono`}>Teléfono</Label>
            <Input
              id={`sol-${servicio}-telefono`}
              inputMode="tel"
              autoComplete="tel"
              placeholder="55 1234 5678"
              {...campo("telefono")}
            />
            {err.telefono && <p className="mt-1 text-xs text-danger-600">{err.telefono}</p>}
          </div>
          <div>
            <Label htmlFor={`sol-${servicio}-correo`}>Correo</Label>
            <Input
              id={`sol-${servicio}-correo`}
              type="email"
              autoComplete="email"
              {...campo("correo")}
            />
            {err.correo && <p className="mt-1 text-xs text-danger-600">{err.correo}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor={`sol-${servicio}-mensaje`}>Comentarios (opcional)</Label>
          <textarea
            id={`sol-${servicio}-mensaje`}
            className="w-full min-h-20 px-3 py-2 rounded-sm border border-black-100 bg-white text-sm text-black-700 outline-none focus:border-secondary-500 focus:ring-2 focus:ring-secondary-100 placeholder:text-black-300"
            maxLength={1000}
            placeholder={ejemplo ?? "Cuéntanos qué necesitas o el mejor horario para llamarte"}
            value={f.mensaje}
            onChange={(e) => setF({ ...f, mensaje: e.target.value })}
          />
        </div>
      </FormDialog>
    </>
  );
}
