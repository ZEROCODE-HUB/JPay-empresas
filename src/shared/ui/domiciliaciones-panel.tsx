import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
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
  useCobrosRecurrentes,
  useDomiciliaciones,
  useRecurrentesMutaciones,
  type Domiciliacion,
  type NuevaDomiciliacionInput,
} from "../recurrentes";
import { formatDate, formatDateTime, formatMoney, parseMonto } from "../format";
import { validarClabe, validarCurp, validarRfc } from "../validadores";
import { ConfirmDialog } from "./confirm-dialog";
import { FormDialog } from "./form-dialog";

const ESTADO: Record<string, { label: string; tone: "success" | "warn" | "danger" | "neutral" }> = {
  creando: { label: "En verificación", tone: "warn" },
  created: { label: "Esperando aceptación", tone: "warn" },
  active: { label: "Activa", tone: "success" },
  pending: { label: "Con cobros pendientes", tone: "danger" },
  completed: { label: "Completada", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  rechazada: { label: "Cuenta no validada", tone: "danger" },
  error: { label: "No creada", tone: "danger" },
};

const selectCls = "mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm";
const ocultarClabe = (c: string) => `•••• ${c.slice(-4)}`;

/**
 * Domiciliación: cargos a la CLABE de un cliente del comercio (Ecart Pay, por Santander). Al
 * crearla, Ecart Pay le escribe al cliente para que la acepte y valida la cuenta; recién activa se
 * le cobra según la frecuencia.
 */
export function DomiciliacionesPanel({
  comercioId,
  titulo,
  descripcion,
}: {
  comercioId: string;
  titulo: string;
  descripcion: string;
}) {
  const lista = useDomiciliaciones(comercioId);
  const cobros = useCobrosRecurrentes(comercioId);
  const m = useRecurrentesMutaciones(comercioId);
  const [nueva, setNueva] = useState(false);
  const [cancelar, setCancelar] = useState<Domiciliacion | null>(null);
  const avisar = (e: unknown) => toast.error((e as Error).message);

  const filas = lista.data ?? [];
  const cobrosDe = (id: string) => (cobros.data ?? []).filter((c) => c.domiciliacion_id === id);

  return (
    <>
      <PageHeader
        title={titulo}
        description={descripcion}
        action={
          <BtnPrimary onClick={() => setNueva(true)}>
            <Plus size={15} /> Nueva domiciliación
          </BtnPrimary>
        }
      />
      {lista.isLoading ? (
        <Card className="text-sm text-muted-foreground">Cargando…</Card>
      ) : lista.isError ? (
        <Card className="text-sm text-danger-600">{(lista.error as Error).message}</Card>
      ) : filas.length === 0 ? (
        <Card className="text-sm text-muted-foreground">
          Todavía no hay domiciliaciones. Creá una con la CLABE del cliente: Ecart Pay le pide que
          la acepte y valida la cuenta antes del primer cargo.
        </Card>
      ) : (
        <div className="space-y-3">
          {filas.map((d) => {
            const e = ESTADO[d.estado] ?? { label: d.estado, tone: "neutral" as const };
            const pagos = cobrosDe(d.id);
            return (
              <Card key={d.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{d.concepto}</p>
                    <p className="text-sm">
                      {d.titular_nombre}{" "}
                      <span className="text-muted-foreground">
                        · {d.titular_email} · CLABE {ocultarClabe(d.clabe)}
                      </span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="font-mono font-semibold">
                        {formatMoney(d.monto, { moneda: d.moneda })}
                      </span>{" "}
                      · {d.recurrente ? intervaloLabel(d.intervalo) : "Cargo único"}
                      {d.ciclo_dia && ` · día ${d.ciclo_dia}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Creada {formatDateTime(d.created_at)}
                      {d.referencia && ` · referencia ${d.referencia}`}
                      {d.proximo_cobro && ` · próximo cargo ${formatDate(d.proximo_cobro)}`}
                    </p>
                    {d.ultimo_error && (
                      <p className="text-xs text-danger-600 mt-1">{d.ultimo_error}</p>
                    )}
                  </div>
                  <Badge tone={e.tone}>{e.label}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <BtnOutline
                    disabled={m.accionDomiciliacion.isPending}
                    onClick={() =>
                      m.accionDomiciliacion.mutate(
                        { id: d.id, accion: "sincronizar" },
                        { onSuccess: () => toast.success("Actualizada"), onError: avisar },
                      )
                    }
                  >
                    <RefreshCw size={14} /> Actualizar
                  </BtnOutline>
                  {["created", "active", "pending"].includes(d.estado) && (
                    <BtnOutline onClick={() => setCancelar(d)}>Cancelar</BtnOutline>
                  )}
                </div>
                {pagos.length > 0 && (
                  <ul className="mt-3 border-t border-border pt-2 text-xs space-y-1">
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

      <NuevaDomiciliacionDialog
        open={nueva}
        guardando={m.crearDomiciliacion.isPending}
        onClose={() => setNueva(false)}
        onGuardar={(v) =>
          m.crearDomiciliacion.mutate(
            { ...v, idempotency_key: nuevaClave() },
            {
              onSuccess: () => {
                toast.success("Domiciliación creada: Ecart Pay le pide al cliente que la acepte");
                setNueva(false);
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
        title="Cancelar la domiciliación"
        confirmLabel="Cancelar domiciliación"
        message={`No se le van a hacer más cargos a ${cancelar?.titular_nombre ?? ""}. No se puede deshacer.`}
        onConfirm={async () => {
          if (!cancelar) return;
          try {
            await m.accionDomiciliacion.mutateAsync({ id: cancelar.id, accion: "cancelar" });
            toast.success("Domiciliación cancelada");
          } catch (e) {
            avisar(e);
            throw e;
          }
        }}
      />
    </>
  );
}

function NuevaDomiciliacionDialog({
  open,
  guardando,
  onClose,
  onGuardar,
}: {
  open: boolean;
  guardando: boolean;
  onClose: () => void;
  onGuardar: (v: NuevaDomiciliacionInput) => void;
}) {
  const vacio = {
    nombre: "",
    email: "",
    telefono: "",
    rfc: "",
    clabe: "",
    alias: "",
    concepto: "",
    monto: "",
    recurrente: "si",
    intervalo: "monthly",
    ciclo_dia: "",
    fecha_fin: "",
  };
  const [f, setF] = useState(vacio);
  const set = (k: keyof typeof vacio) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const guardar = () => {
    const monto = parseMonto(f.monto);
    const clabe = f.clabe.replace(/\D/g, "");
    const rfc = f.rfc.trim().toUpperCase();
    if (!f.nombre.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()))
      return toast.error("Completá el nombre y un correo válido del titular");
    const errClabe = validarClabe(clabe);
    if (errClabe) return toast.error(errClabe);
    if (rfc) {
      const errId = rfc.length === 18 ? validarCurp(rfc) : validarRfc(rfc);
      if (errId) return toast.error(errId);
    }
    if (!f.concepto.trim()) return toast.error("Falta el concepto del cargo");
    if (!(monto > 0)) return toast.error("Monto inválido");
    const recurrente = f.recurrente === "si";
    onGuardar({
      nombre: f.nombre.trim(),
      email: f.email.trim(),
      telefono: f.telefono.trim() || undefined,
      rfc: rfc && rfc.length !== 18 ? rfc : null,
      clabe,
      alias: f.alias.trim(),
      concepto: f.concepto.trim(),
      monto,
      recurrente,
      intervalo: recurrente ? f.intervalo : null,
      ciclo_dia: f.ciclo_dia ? Number(f.ciclo_dia) : null,
      fecha_fin: f.fecha_fin || null,
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={() => {
        setF(vacio);
        onClose();
      }}
      title="Nueva domiciliación"
      description="Cargo a la CLABE del cliente. Ecart Pay le pide que lo acepte y valida la cuenta antes del primer cargo (solo pesos)."
      onSubmit={guardar}
      submitLabel="Crear domiciliación"
      isSubmitting={guardando}
      size="lg"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Campo
          id="dom-nombre"
          label="Nombre del titular"
          value={f.nombre}
          onChange={set("nombre")}
        />
        <Campo id="dom-email" label="Correo" type="email" value={f.email} onChange={set("email")} />
        <Campo id="dom-clabe" label="CLABE (18 dígitos)" value={f.clabe} onChange={set("clabe")} />
        <Campo
          id="dom-rfc"
          label="RFC del titular (opcional)"
          value={f.rfc}
          onChange={set("rfc")}
        />
        <Campo
          id="dom-alias"
          label="Alias de la cuenta (opcional)"
          value={f.alias}
          onChange={set("alias")}
        />
        <Campo
          id="dom-tel"
          label="Teléfono (opcional)"
          value={f.telefono}
          onChange={set("telefono")}
        />
        <Campo id="dom-concepto" label="Concepto" value={f.concepto} onChange={set("concepto")} />
        <Campo id="dom-monto" label="Monto (MXN)" value={f.monto} onChange={set("monto")} />
        <div>
          <Label htmlFor="dom-tipo">Tipo de cargo</Label>
          <select
            id="dom-tipo"
            className={selectCls}
            value={f.recurrente}
            onChange={(e) => set("recurrente")(e.target.value)}
          >
            <option value="si">Recurrente</option>
            <option value="no">Único</option>
          </select>
        </div>
        {f.recurrente === "si" && (
          <div>
            <Label htmlFor="dom-intervalo">Frecuencia</Label>
            <select
              id="dom-intervalo"
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
        )}
        <Campo
          id="dom-dia"
          label="Día del mes de cobro (opcional)"
          type="number"
          value={f.ciclo_dia}
          onChange={set("ciclo_dia")}
        />
        {f.recurrente === "si" && (
          <Campo
            id="dom-fin"
            label="Termina el (opcional)"
            type="date"
            value={f.fecha_fin}
            onChange={set("fecha_fin")}
          />
        )}
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
