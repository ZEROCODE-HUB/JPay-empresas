import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Plus, Send, Search, Upload, Star, Trash2 } from "lucide-react";
import {
  PageHeader,
  Card,
  BtnPrimary,
  BtnOutline,
  Input,
  Stat,
  Label,
} from "@/components/portal-shell";
import { toast } from "sonner";
import { FormDialog } from "@/shared/ui/form-dialog";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { toDataError, isPermissionError } from "@/lib/supabase";
import { executeTransfer } from "@/lib/transfer-orchestrator";
import {
  type FrequentRecipient,
  createFrequentRecipient,
  deleteFrequentRecipient,
} from "@/lib/api/transferencias";
import { detectIdentifierKind } from "@/lib/recipient-validation";
import { validateRecipient } from "@/lib/recipient-bdc";
import { useDestinatariosFrecuentes, useSubcuentasOrigen } from "@/hooks/useTransferencias";
import { formatDate, formatMoney } from "@/shared/format";
import {
  filtrarDestinatarios,
  ordenarDestinatarios,
  type OrdenDestinatarios,
} from "@/features/transferencias/utils";

export const Route = createFileRoute("/app/destinatarios")({ component: Page });

type Destinatario = {
  /** id en `destinatarios_frecuentes` (vacío solo para filas efímeras). */
  id: string;
  n: string;
  a: string;
  cbu: string;
  b: string;
  fav: boolean;
  /** Fecha de alta en la agenda (ISO). */
  creadoEn?: string;
};

/**
 * Agenda real: `destinatarios_frecuentes` (migración 1012), misma tabla que
 * usa la pantalla de transferencias. Antes acá había data de ejemplo hardcodeada.
 */
function aDestinatario(f: FrequentRecipient): Destinatario {
  return {
    id: f.id,
    n: f.nombre,
    a: f.alias || "",
    cbu: f.cbu,
    b: f.banco || "—",
    fav: false,
    creadoEn: f.creadoEn,
  };
}

function Page() {
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoAlias, setNuevoAlias] = useState("");
  const [nuevoCbu, setNuevoCbu] = useState("");
  const [nuevoCuit, setNuevoCuit] = useState("");
  const [transferir, setTransferir] = useState<Destinatario | null>(null);
  const [eliminar, setEliminar] = useState<Destinatario | null>(null);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [subcuentaOrigen, setSubcuentaOrigen] = useState("");
  const [sending, setSending] = useState(false);
  const {
    frecuentes,
    cargando,
    setFrecuentes,
    recargar: cargarDestinatarios,
  } = useDestinatariosFrecuentes();
  const items = useMemo(() => frecuentes.map(aDestinatario), [frecuentes]);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenDestinatarios>("recientes");
  // Filtro por nombre/alias/CBU y orden sobre la agenda real.
  const visibles = useMemo(
    () =>
      ordenarDestinatarios(filtrarDestinatarios(frecuentes, busqueda), orden).map(aDestinatario),
    [frecuentes, busqueda, orden],
  );
  const { subcuentas, recargar: recargarSubcuentas } = useSubcuentasOrigen();

  // Al cargar (o recargar) las subcuentas se preselecciona la primera.
  const primeraSubcuenta = subcuentas[0]?.id;
  useEffect(() => {
    if (primeraSubcuenta) setSubcuentaOrigen(primeraSubcuenta);
  }, [primeraSubcuenta]);

  const cargarSubcuentas = async () => {
    const lista = await recargarSubcuentas();
    if (lista && lista.length > 0) setSubcuentaOrigen(lista[0].id);
  };

  const handleTransferir = async () => {
    if (!transferir || !subcuentaOrigen || !monto) return;
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      toast.error("Ingresa un monto valido");
      return;
    }
    setSending(true);
    try {
      // Destinatario frecuente → validación desacoplada → ejecución → movimiento
      const res = await executeTransfer({
        subcuentaOrigenId: subcuentaOrigen,
        destinatarioIdentifier: transferir.cbu,
        monto: montoNum,
        concepto: concepto || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Validación fallida");
        return;
      }
      toast.success(`Transferencia enviada — TXID: ${res.txn.id_txn}`);
      setTransferir(null);
      setMonto("");
      setConcepto("");
      await cargarSubcuentas();
    } catch (e) {
      const err = toDataError(e);
      if (isPermissionError(e)) {
        toast.error("Sin permisos para realizar esta transferencia");
      } else {
        toast.error(err.message || "No se pudo enviar la transferencia");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Mis destinatarios"
        description="Agenda de contactos frecuentes con validacion CBU."
        action={
          <div className="flex gap-2">
            <BtnOutline>
              <Upload size={14} /> Importar CSV
            </BtnOutline>
            <BtnPrimary onClick={() => setNuevoOpen(true)}>
              <Plus size={16} /> Nuevo destinatario
            </BtnPrimary>
          </div>
        }
      />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Stat label="Total destinatarios" value={String(items.length)} />
        <Stat label="Subcuentas" value={String(subcuentas.length)} />
        <Stat
          label="Disponible"
          value={formatMoney(subcuentas.reduce((s, x) => s + (Number(x.saldo_disponible) || 0), 0))}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b flex flex-wrap gap-2 items-center">
          <div className="relative w-full sm:flex-1 sm:min-w-[240px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Buscar por nombre, alias o CBU..."
              className="pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <select
            className="h-10 px-3 rounded-md border bg-card text-sm"
            value={orden}
            onChange={(e) => setOrden(e.target.value as OrdenDestinatarios)}
          >
            <option value="recientes">Ordenar: recientes</option>
            <option value="alfabetico">Alfabetico</option>
          </select>
        </div>

        <div className="hidden md:grid grid-cols-[auto_1.2fr_1fr_1.4fr_0.8fr_0.8fr_auto] gap-4 px-5 py-3 border-b text-xs uppercase tracking-wide text-muted-foreground">
          <div></div>
          <div>Nombre</div>
          <div>Alias</div>
          <div>CBU</div>
          <div>Banco</div>
          <div>Agregado</div>
          <div></div>
        </div>
        {frecuentes.length === 0 && !cargando && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Todavía no guardaste destinatarios. Cargá uno con "Nuevo destinatario".
          </div>
        )}
        {frecuentes.length > 0 && visibles.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Ningún destinatario coincide con "{busqueda.trim()}".
          </div>
        )}
        {cargando && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Cargando agenda…
          </div>
        )}
        {visibles.map((d) => (
          <div
            key={d.id || d.n}
            className="md:grid md:grid-cols-[auto_1.2fr_1fr_1.4fr_0.8fr_0.8fr_auto] gap-4 px-5 py-4 border-b last:border-0 items-center"
          >
            <Star
              size={14}
              className={d.fav ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}
            />
            <div>
              <div className="font-semibold">{d.n}</div>
              <div className="text-xs text-muted-foreground md:hidden">
                @{d.a} · {d.b}
              </div>
            </div>
            <div className="text-sm text-muted-foreground hidden md:block">
              {d.a ? `@${d.a}` : "—"}
            </div>
            <div className="text-sm font-mono text-muted-foreground hidden md:block">{d.cbu}</div>
            <div className="text-sm text-muted-foreground hidden md:block truncate">{d.b}</div>
            <div className="text-sm text-muted-foreground hidden md:block">
              {d.creadoEn ? formatDate(d.creadoEn) : "—"}
            </div>
            <div className="flex gap-1 mt-2 md:mt-0 justify-end">
              <BtnOutline
                className="h-9 px-3"
                onClick={() => {
                  setTransferir(d);
                  setMonto("");
                  setConcepto("");
                }}
              >
                <Send size={14} /> Transferir
              </BtnOutline>
              <button
                className="h-9 w-9 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 text-muted-foreground hover:text-danger-600"
                title="Eliminar de la agenda"
                onClick={() => setEliminar(d)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </Card>

      <FormDialog
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        title="Nuevo destinatario"
        description="Agregalo a tu agenda para reutilizarlo en transferencias (CBU/CVU/Alias validado vía capa desacoplada)."
        submitLabel="Agregar destinatario"
        onSubmit={async () => {
          const identifier = (nuevoCbu || nuevoAlias).trim();
          if (!identifier) {
            toast.error("Ingresa CBU/CVU (22 dígitos) o Alias");
            return;
          }
          const res = await validateRecipient(identifier, detectIdentifierKind(identifier));
          if (!res.ok) {
            toast.error(res.errorMessage ?? "Destinatario no válido");
            return;
          }
          try {
            await createFrequentRecipient({
              identifier: res.identifier,
              nombre: nuevoNombre || res.titular?.nombre || "Destinatario",
              alias: res.titular?.alias ?? nuevoAlias,
              cbu: res.titular?.cbu ?? nuevoCbu,
              cuit: nuevoCuit || res.titular?.cuit,
              banco: res.titular?.banco ?? undefined,
            });
            await cargarDestinatarios();
            setNuevoOpen(false);
            setNuevoNombre("");
            setNuevoAlias("");
            setNuevoCbu("");
            setNuevoCuit("");
            toast.success("Destinatario agregado a tu agenda");
          } catch (e) {
            toast.error(toDataError(e).message);
          }
        }}
      >
        <div>
          <Label>Nombre o razon social</Label>
          <Input
            placeholder="Ej. Proveedor SA"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
          />
        </div>
        <div>
          <Label>Alias</Label>
          <Input
            placeholder="proveedor.sa"
            value={nuevoAlias}
            onChange={(e) => setNuevoAlias(e.target.value)}
          />
        </div>
        <div>
          <Label>CBU / CVU / Alias</Label>
          <Input
            placeholder="22 dígitos o alias 6-20"
            value={nuevoCbu}
            onChange={(e) => setNuevoCbu(e.target.value)}
          />
          <div className="text-[11px] text-muted-foreground mt-1">
            Se validará vía servicio desacoplado (mock hoy, COELSA mañana)
          </div>
        </div>
        <div>
          <Label>CUIT/CUIL (opcional)</Label>
          <Input
            placeholder="XX-XXXXXXXX-X"
            value={nuevoCuit}
            onChange={(e) => setNuevoCuit(e.target.value)}
          />
        </div>
      </FormDialog>

      <FormDialog
        open={!!transferir}
        onClose={() => setTransferir(null)}
        title={`Transferir a ${transferir?.n ?? ""}`}
        description="Confirma el monto y la subcuenta de origen para enviar la transferencia."
        submitLabel={sending ? "Enviando..." : "Enviar transferencia"}
        onSubmit={handleTransferir}
      >
        {transferir && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-semibold text-sm text-foreground">{transferir.n}</div>
            <div className="text-muted-foreground">
              @{transferir.a} · {transferir.b}
            </div>
            <div className="font-mono text-muted-foreground">{transferir.cbu}</div>
          </div>
        )}
        <div>
          <Label>Subcuenta de origen</Label>
          <select
            className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            value={subcuentaOrigen}
            onChange={(e) => setSubcuentaOrigen(e.target.value)}
          >
            {subcuentas.length === 0 && <option value="">Sin subcuentas</option>}
            {subcuentas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} — {formatMoney(Number(s.saldo_disponible))}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Monto (ARS)</Label>
          <Input
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0,00"
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <Label>Concepto</Label>
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Pago factura, sueldo, etc."
          />
        </div>
      </FormDialog>

      <ConfirmDialog
        confirmLabel="Eliminar"
        variant="danger"
        closeOnConfirm
        open={!!eliminar}
        title="Eliminar destinatario"
        message={
          eliminar
            ? `Se quitará "${eliminar.n}" de tu agenda. No afecta transferencias ya hechas.`
            : ""
        }
        onClose={() => setEliminar(null)}
        onConfirm={async () => {
          const d = eliminar;
          setEliminar(null);
          if (!d) return;
          try {
            await deleteFrequentRecipient(d.id);
            setFrecuentes((prev) => prev.filter((x) => x.id !== d.id));
            toast.success("Destinatario eliminado de la agenda");
          } catch (e) {
            toast.error(toDataError(e).message);
          }
        }}
      />
    </>
  );
}
