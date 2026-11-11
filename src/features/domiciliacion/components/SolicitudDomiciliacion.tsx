import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { useClienteSesion } from "@/hooks/useCuenta";
import { getUltimaSolicitud, solicitarContacto } from "@/lib/api/solicitudes";
import { formatDateTime } from "@/shared/format";
import { brand } from "@/brand/brand";

const KEY = ["solicitudes", "domiciliacion"] as const;
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Domiciliación la activa un ejecutivo de JPay: el comercio deja sus datos de contacto
 * (prellenados con los de su cuenta) y la solicitud llega al admin.
 */
export function SolicitudDomiciliacion() {
  const qc = useQueryClient();
  const { cliente, isLoading } = useClienteSesion();
  const ultima = useQuery({ queryKey: KEY, queryFn: () => getUltimaSolicitud("domiciliacion") });
  const [f, setF] = useState({ nombre: "", telefono: "", correo: "", mensaje: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState(false);

  // Prellenado: la solicitud abierta (si hay) o los datos de la cuenta.
  useEffect(() => {
    const s = ultima.data;
    if (s && s.estado === "nueva") {
      setF({ nombre: s.nombre, telefono: s.telefono, correo: s.correo, mensaje: s.mensaje ?? "" });
      return;
    }
    if (!cliente) return;
    const c = cliente as Record<string, unknown>;
    const nombre = [c.nombre, c.apellido]
      .filter((x) => typeof x === "string" && x.trim())
      .join(" ");
    setF((prev) => ({
      nombre: prev.nombre || nombre || String(c.nombre_fantasia ?? ""),
      telefono: prev.telefono || String(c.telefono ?? ""),
      correo: prev.correo || String(c.correo ?? ""),
      mensaje: prev.mensaje,
    }));
  }, [cliente, ultima.data]);

  const enviar = useMutation({
    mutationFn: () =>
      solicitarContacto({
        servicio: "domiciliacion",
        nombre: f.nombre.trim(),
        telefono: f.telefono.trim(),
        correo: f.correo.trim(),
        mensaje: f.mensaje.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(`¡Listo! Un ejecutivo de ${brand.name} te contactará pronto.`);
      setEditando(false);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error((e as Error).message || "No se pudo enviar tu solicitud"),
  });

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

  const s = ultima.data;
  const abierta = s?.estado === "nueva";
  const atendida = s?.estado === "contactado";

  if (isLoading || ultima.isLoading) {
    return <Card className="text-sm text-black-400">Cargando…</Card>;
  }

  if ((abierta || atendida) && !editando) {
    return (
      <Card className="max-w-xl">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={22} />
          <div>
            <h2 className="font-semibold">
              {abierta ? "Recibimos tu solicitud" : "Un ejecutivo ya te contactó"}
            </h2>
            <p className="mt-1 text-sm text-black-500">
              {abierta
                ? `Un ejecutivo de ${brand.name} te contactará pronto para activar la domiciliación en tu cuenta.`
                : "Si todavía necesitas ayuda con la domiciliación, puedes enviarnos tus datos otra vez."}
            </p>
            <dl className="mt-3 text-sm grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
              <dt className="text-black-400">Nombre</dt>
              <dd>{s!.nombre}</dd>
              <dt className="text-black-400">Teléfono</dt>
              <dd>{s!.telefono}</dd>
              <dt className="text-black-400">Correo</dt>
              <dd>{s!.correo}</dd>
              <dt className="text-black-400">Enviada</dt>
              <dd>{formatDateTime(s!.createdAt)}</dd>
            </dl>
            <button
              type="button"
              className="mt-4 text-sm font-medium text-primary-ink hover:underline"
              onClick={() => setEditando(true)}
            >
              {abierta ? "Corregir mis datos" : "Enviar otra solicitud"}
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="max-w-xl">
      <h2 className="font-semibold">Llena tus datos y un ejecutivo te contactará</h2>
      <p className="mt-1 text-sm text-black-500">
        Con la domiciliación cobras de forma recurrente o única a la cuenta de tus clientes, con su
        autorización. Un ejecutivo de {brand.name} te explica cómo funciona y la activa en tu
        cuenta.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (validar()) enviar.mutate();
        }}
      >
        <div>
          <Label htmlFor="dom-nombre">Nombre</Label>
          <Input
            id="dom-nombre"
            className="mt-1"
            value={f.nombre}
            autoComplete="name"
            onChange={(e) => setF({ ...f, nombre: e.target.value })}
          />
          {err.nombre && <p className="mt-1 text-xs text-danger-600">{err.nombre}</p>}
        </div>
        <div>
          <Label htmlFor="dom-telefono">Teléfono</Label>
          <Input
            id="dom-telefono"
            className="mt-1"
            inputMode="tel"
            autoComplete="tel"
            placeholder="55 1234 5678"
            value={f.telefono}
            onChange={(e) => setF({ ...f, telefono: e.target.value })}
          />
          {err.telefono && <p className="mt-1 text-xs text-danger-600">{err.telefono}</p>}
        </div>
        <div>
          <Label htmlFor="dom-correo">Correo</Label>
          <Input
            id="dom-correo"
            className="mt-1"
            type="email"
            autoComplete="email"
            value={f.correo}
            onChange={(e) => setF({ ...f, correo: e.target.value })}
          />
          {err.correo && <p className="mt-1 text-xs text-danger-600">{err.correo}</p>}
        </div>
        <div>
          <Label htmlFor="dom-mensaje">Comentarios (opcional)</Label>
          <textarea
            id="dom-mensaje"
            className="mt-1 w-full min-h-20 px-3 py-2 rounded-md border border-input bg-card text-sm"
            maxLength={1000}
            placeholder="Por ejemplo: cuántos clientes quieres domiciliar o el mejor horario para llamarte"
            value={f.mensaje}
            onChange={(e) => setF({ ...f, mensaje: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <BtnPrimary type="submit" disabled={enviar.isPending}>
            {enviar.isPending ? "Enviando…" : "Enviar"}
          </BtnPrimary>
          {editando && (
            <button
              type="button"
              className="text-sm text-black-400 hover:underline"
              onClick={() => setEditando(false)}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}
