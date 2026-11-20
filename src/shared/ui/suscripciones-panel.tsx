import { useState, type ReactNode } from "react";
import { Copy, Link2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  BtnOutline,
  BtnPrimary,
  Card,
  Input,
  Label,
  PageHeader,
} from "@/components/portal-shell";
import {
  INTERVALOS,
  intervaloLabel,
  nuevaClave,
  tieneTarjeta,
  useCobrosRecurrentes,
  useRecurrentesMutaciones,
  useSuscripciones,
  type NuevaSuscripcionInput,
  type Suscripcion,
} from "../recurrentes";
import { formatDate, formatDateTime, formatMoney, parseMonto } from "../format";
import { ConfirmDialog } from "./confirm-dialog";
import { FormDialog } from "./form-dialog";

const ESTADO: Record<string, { label: string; tone: "success" | "warn" | "danger" | "neutral" }> = {
  creando: { label: "En verificación", tone: "warn" },
  activa: { label: "Activa", tone: "success" },
  pausada: { label: "Pausada", tone: "warn" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  terminada: { label: "Terminada", tone: "neutral" },
  error: { label: "No creada", tone: "danger" },
};

const MENSAJE_ACCION = {
  sincronizar: "Actualizada",
  pausar: "Suscripción pausada",
  reanudar: "Suscripción reanudada",
  reintentar: "Suscripción creada: ya puedes compartir el link",
  descartar: "Suscripción descartada",
} as const;

/** El link que da Ecart Pay al crearla caduca; pasado un día se genera otro. */
const linkReciente = (s: Suscripcion) =>
  Date.now() - Date.parse(s.respuesta?.created_at ?? s.created_at) < 24 * 60 * 60 * 1000;

/** Motivo entendible de una suscripción que no se pudo crear. */
function errorAmigable(error: string | null): string {
  if (!error) return "No se pudo crear la suscripción. Puedes reintentarla.";
  if (/redirect_url/i.test(error))
    return "No se pudo crear por un error de configuración que ya está corregido. Reinténtala.";
  return `No se pudo crear la suscripción: ${error.replace(/\s*\(HTTP \d+\)$/, "")}`;
}

const selectCls = "mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm";

const cadaCuanto = (s: Pick<Suscripcion, "intervalo" | "frecuencia">) => {
  const i = INTERVALOS.find((x) => x.value === s.intervalo);
  return s.frecuencia > 1 && i ? `Cada ${s.frecuencia} ${i.plural}` : intervaloLabel(s.intervalo);
};

/**
 * Suscripciones con tarjeta del comercio (Ecart Pay). Al crearla, Ecart Pay devuelve un link que
 * el comercio comparte con el suscriptor: ahí agrega su tarjeta y se cobra en cada período.
 */
export function SuscripcionesPanel({
  comercioId,
  titulo,
  descripcion,
  aviso,
}: {
  comercioId: string;
  titulo: string;
  descripcion: string;
  /** Contenido opcional entre el encabezado y la lista. */
  aviso?: ReactNode;
}) {
  const lista = useSuscripciones(comercioId);
  const cobros = useCobrosRecurrentes(comercioId);
  const m = useRecurrentesMutaciones(comercioId);
  const [nueva, setNueva] = useState(false);
  const [cancelar, setCancelar] = useState<Suscripcion | null>(null);
  const avisar = (e: unknown) => toast.error((e as Error).message);

  const accion = (
    s: Suscripcion,
    a: "sincronizar" | "pausar" | "reanudar" | "reintentar" | "descartar",
  ) =>
    m.accionSuscripcion.mutate(
      { id: s.id, accion: a },
      {
        onSuccess: () => toast.success(MENSAJE_ACCION[a]),
        onError: avisar,
      },
    );

  const renovar = (s: Suscripcion) =>
    m.renovarLink.mutate(s.id, {
      onSuccess: async (r) => {
        if (r.link) await copiar(r.link);
        else toast.success("Link nuevo generado");
      },
      onError: avisar,
    });

  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado: compártelo con el suscriptor");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const filas = lista.data ?? [];
  const cobrosDe = (id: string) => (cobros.data ?? []).filter((c) => c.suscripcion_id === id);

  return (
    <>
      <PageHeader
        title={titulo}
        description={descripcion}
        action={
          <BtnPrimary onClick={() => setNueva(true)}>
            <Plus size={15} /> Nueva suscripción
          </BtnPrimary>
        }
      />
      {aviso}
      {lista.isLoading ? (
        <Card className="text-sm text-muted-foreground">Cargando…</Card>
      ) : lista.isError ? (
        <Card className="text-sm text-danger-600">{(lista.error as Error).message}</Card>
      ) : filas.length === 0 ? (
        <Card className="text-sm text-muted-foreground">
          Todavía no hay suscripciones. Crea una: te damos un link para que el suscriptor cargue su
          tarjeta y se le cobre en cada período.
        </Card>
      ) : (
        <div className="space-y-3">
          {filas.map((s) => {
            const e = ESTADO[s.estado] ?? { label: s.estado, tone: "neutral" as const };
            const pagos = cobrosDe(s.id);
            const vigente = s.estado === "activa" || s.estado === "pausada";
            const tarjeta = tieneTarjeta(s);
            return (
              <Card key={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.servicio}</p>
                    <p className="text-sm">
                      {s.suscriptor_nombre}{" "}
                      <span className="text-muted-foreground">· {s.suscriptor_email}</span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="font-mono font-semibold">
                        {formatMoney(s.monto, { moneda: s.moneda })}
                      </span>{" "}
                      · {cadaCuanto(s)}
                      {s.dias_prueba > 0 && ` · ${s.dias_prueba} días de prueba`}
                      {s.fecha_fin && ` · hasta ${formatDate(s.fecha_fin)}`}
                    </p>
                    {vigente && (
                      <p className={`text-xs mt-1 ${tarjeta ? "text-success" : "text-warning"}`}>
                        {tarjeta
                          ? "Tarjeta registrada"
                          : "Esperando que el suscriptor agregue su tarjeta"}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Creada {formatDateTime(s.created_at)}
                      {tarjeta &&
                        s.proximo_cobro &&
                        ` · próximo cobro ${formatDate(s.proximo_cobro)}`}
                      {s.intentos > 0 && ` · ${s.intentos} intentos fallidos`}
                    </p>
                    {s.estado === "error" ? (
                      <p className="text-xs text-danger-600 mt-1">
                        {errorAmigable(s.ultimo_error)}
                      </p>
                    ) : (
                      s.ultimo_error && (
                        <p className="text-xs text-danger-600 mt-1">{s.ultimo_error}</p>
                      )
                    )}
                  </div>
                  <Badge tone={e.tone}>{e.label}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.estado === "error" ? (
                    <>
                      <BtnPrimary
                        disabled={m.accionSuscripcion.isPending}
                        onClick={() => accion(s, "reintentar")}
                      >
                        <RefreshCw size={14} /> Reintentar
                      </BtnPrimary>
                      <BtnOutline
                        disabled={m.accionSuscripcion.isPending}
                        onClick={() => accion(s, "descartar")}
                      >
                        Descartar
                      </BtnOutline>
                    </>
                  ) : (
                    <>
                      {vigente && !tarjeta && s.checkout_link && linkReciente(s) && (
                        <BtnOutline onClick={() => copiar(s.checkout_link!)}>
                          <Copy size={14} /> Copiar link para el suscriptor
                        </BtnOutline>
                      )}
                      {s.estado === "activa" && !tarjeta && !linkReciente(s) && (
                        <BtnOutline disabled={m.renovarLink.isPending} onClick={() => renovar(s)}>
                          <Link2 size={14} />{" "}
                          {m.renovarLink.isPending ? "Generando…" : "Generar link nuevo"}
                        </BtnOutline>
                      )}
                      <BtnOutline
                        disabled={m.accionSuscripcion.isPending}
                        onClick={() => accion(s, "sincronizar")}
                      >
                        <RefreshCw size={14} /> Actualizar
                      </BtnOutline>
                      {s.estado === "activa" && (
                        <BtnOutline
                          disabled={m.accionSuscripcion.isPending}
                          onClick={() => accion(s, "pausar")}
                        >
                          Pausar
                        </BtnOutline>
                      )}
                      {s.estado === "pausada" && (
                        <BtnOutline
                          disabled={m.accionSuscripcion.isPending}
                          onClick={() => accion(s, "reanudar")}
                        >
                          Reanudar
                        </BtnOutline>
                      )}
                      {vigente && <BtnOutline onClick={() => setCancelar(s)}>Cancelar</BtnOutline>}
                    </>
                  )}
                </div>
                {pagos.length > 0 && (
                  <ul className="mt-3 border-t border-border pt-2 text-xs space-y-1">
                    <li className="font-medium text-muted-foreground">Cobros</li>
                    {pagos.slice(0, 6).map((c) => (
                      <li key={c.id} className="flex justify-between gap-3">
                        <span>
                          {formatDateTime(c.cobrado_at)}
                          {c.motivo && <span className="text-muted-foreground"> · {c.motivo}</span>}
                        </span>
                        <span
                          className={
                            c.estado === "pagado" ? "font-mono" : "font-mono text-danger-600"
                          }
                        >
                          {c.estado === "pagado" ? "" : "Falló · "}
                          {formatMoney(c.monto, { moneda: c.moneda })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <NuevaSuscripcionDialog
        open={nueva}
        guardando={m.crearSuscripcion.isPending}
        onClose={() => setNueva(false)}
        onGuardar={(v) =>
          m.crearSuscripcion.mutate(
            { ...v, idempotency_key: nuevaClave() },
            {
              onSuccess: (s) => {
                toast.success("Suscripción creada: copia el link y compártelo con el suscriptor");
                setNueva(false);
                if (s.checkout_link) void copiar(s.checkout_link);
              },
              onError: avisar,
            },
          )
        }
      />
      <ConfirmDialog
        open={!!cancelar}
        onClose={() => setCancelar(null)}
        variant="danger"
        closeOnConfirm
        title="Cancelar la suscripción"
        confirmLabel="Cancelar suscripción"
        message={`No se le van a hacer más cobros a ${cancelar?.suscriptor_nombre ?? ""}. No se puede deshacer.`}
        onConfirm={async () => {
          if (!cancelar) return;
          try {
            await m.accionSuscripcion.mutateAsync({ id: cancelar.id, accion: "cancelar" });
            toast.success("Suscripción cancelada");
          } catch (e) {
            avisar(e);
            throw e;
          }
        }}
      />
    </>
  );
}

function NuevaSuscripcionDialog({
  open,
  guardando,
  onClose,
  onGuardar,
}: {
  open: boolean;
  guardando: boolean;
  onClose: () => void;
  onGuardar: (v: NuevaSuscripcionInput) => void;
}) {
  const vacio = {
    nombre: "",
    email: "",
    telefono: "",
    servicio: "",
    beneficios: "",
    monto: "",
    moneda: "MXN" as "MXN" | "USD",
    intervalo: "monthly",
    frecuencia: "1",
    dias_prueba: "0",
    ciclo_dia: "",
    fecha_fin: "",
  };
  const [f, setF] = useState(vacio);
  const set = (k: keyof typeof vacio) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const guardar = () => {
    const monto = parseMonto(f.monto);
    if (!f.nombre.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()))
      return toast.error("Completa el nombre y un correo válido del suscriptor");
    if (!f.servicio.trim()) return toast.error("Falta el nombre del servicio");
    if (!(monto > 0)) return toast.error("Monto inválido");
    onGuardar({
      nombre: f.nombre.trim(),
      email: f.email.trim(),
      telefono: f.telefono.trim() || undefined,
      servicio: f.servicio.trim(),
      beneficios: f.beneficios
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean),
      monto,
      moneda: f.moneda,
      intervalo: f.intervalo,
      frecuencia: Number(f.frecuencia) || 1,
      dias_prueba: Number(f.dias_prueba) || 0,
      ciclo_dia: f.ciclo_dia ? Number(f.ciclo_dia) : null,
      fecha_fin: f.fecha_fin || null,
      compromiso_periodos: null,
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={() => {
        setF(vacio);
        onClose();
      }}
      title="Nueva suscripción"
      description="Te damos un link para que el suscriptor cargue su tarjeta; el primer cobro se hace ahí (o al terminar la prueba)."
      onSubmit={guardar}
      submitLabel="Crear suscripción"
      isSubmitting={guardando}
      size="lg"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Campo
          id="sus-nombre"
          label="Nombre del suscriptor"
          value={f.nombre}
          onChange={set("nombre")}
        />
        <Campo id="sus-email" label="Correo" type="email" value={f.email} onChange={set("email")} />
        <Campo
          id="sus-tel"
          label="Teléfono (opcional)"
          value={f.telefono}
          onChange={set("telefono")}
        />
        <Campo
          id="sus-servicio"
          label="Servicio o plan"
          value={f.servicio}
          onChange={set("servicio")}
        />
        <Campo id="sus-monto" label="Monto por cobro" value={f.monto} onChange={set("monto")} />
        <div>
          <Label htmlFor="sus-moneda">Moneda</Label>
          <select
            id="sus-moneda"
            className={selectCls}
            value={f.moneda}
            onChange={(e) => set("moneda")(e.target.value)}
          >
            <option value="MXN">Pesos (MXN)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </div>
        <div>
          <Label htmlFor="sus-intervalo">Frecuencia</Label>
          <select
            id="sus-intervalo"
            className={selectCls}
            value={f.intervalo}
            onChange={(e) => set("intervalo")(e.target.value)}
          >
            {INTERVALOS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <Campo
          id="sus-frecuencia"
          label="Cada cuántos períodos"
          type="number"
          value={f.frecuencia}
          onChange={set("frecuencia")}
        />
        <Campo
          id="sus-prueba"
          label="Días de prueba gratis"
          type="number"
          value={f.dias_prueba}
          onChange={set("dias_prueba")}
        />
        {f.intervalo !== "daily" && (
          <Campo
            id="sus-dia"
            label={
              f.intervalo === "weekly"
                ? "Día de cobro (1 = lunes, opcional)"
                : "Día del mes de cobro (opcional)"
            }
            type="number"
            value={f.ciclo_dia}
            onChange={set("ciclo_dia")}
          />
        )}
        <Campo
          id="sus-fin"
          label="Termina el (opcional)"
          type="date"
          value={f.fecha_fin}
          onChange={set("fecha_fin")}
        />
        <div className="md:col-span-2">
          <Label htmlFor="sus-beneficios">Beneficios (uno por línea, opcional)</Label>
          <textarea
            id="sus-beneficios"
            className="mt-1 w-full min-h-20 px-3 py-2 rounded-md border border-input bg-card text-sm"
            value={f.beneficios}
            onChange={(e) => set("beneficios")(e.target.value)}
          />
        </div>
      </div>
    </FormDialog>
  );
}

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
