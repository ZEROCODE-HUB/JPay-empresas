import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary, Card, PageHeader } from "@/components/portal-shell";
import {
  usePuntosFisicos,
  usePuntosFisicosMutaciones,
  type Caja,
  type Sucursal,
} from "../puntos-fisicos";
import { ConfirmDialog } from "./confirm-dialog";
import { CajaDialog, SucursalDialog } from "./puntos-fisicos-formularios";
import { SucursalCard } from "./sucursal-card";

type Baja = { tipo: "sucursal"; s: Sucursal } | { tipo: "caja"; c: Caja };

/**
 * Sucursales, cajas (POS) y terminales de un comercio en Ecart Pay: alta, edición, baja,
 * vínculo de terminales y sincronización. Lo usan el portal (su comercio) y el admin (el comercio
 * elegido); el comercio tiene que tener Ecart Pay conectado.
 */
export function PuntosFisicosPanel({
  comercioId,
  titulo,
  descripcion,
}: {
  comercioId: string;
  titulo: string;
  descripcion: string;
}) {
  const { data, isLoading, error } = usePuntosFisicos(comercioId);
  const m = usePuntosFisicosMutaciones(comercioId);

  const [sucursalForm, setSucursalForm] = useState<{ s: Sucursal | null } | null>(null);
  const [cajaForm, setCajaForm] = useState<{ sucursalId: string; c: Caja | null } | null>(null);
  const [baja, setBaja] = useState<Baja | null>(null);
  const ocupado =
    m.guardarSucursal.isPending ||
    m.borrarSucursal.isPending ||
    m.guardarCaja.isPending ||
    m.borrarCaja.isPending ||
    m.vincular.isPending ||
    m.sincronizar.isPending;
  const avisar = (e: unknown) => toast.error((e as Error).message);

  const sincronizar = () =>
    m.sincronizar.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `Sincronizado: ${r.sucursales} sucursales, ${r.cajas} cajas, ${r.terminales} terminales`,
        ),
      onError: avisar,
    });

  const sucursales = data?.sucursales ?? [];
  const terminales = data?.terminales ?? [];

  return (
    <>
      <PageHeader
        title={titulo}
        description={descripcion}
        action={
          <div className="flex gap-2">
            <BtnOutline onClick={sincronizar} disabled={ocupado}>
              <RefreshCw size={15} className={m.sincronizar.isPending ? "animate-spin" : ""} />
              Sincronizar con Ecart Pay
            </BtnOutline>
            <BtnPrimary onClick={() => setSucursalForm({ s: null })} disabled={ocupado}>
              <Plus size={15} /> Nueva sucursal
            </BtnPrimary>
          </div>
        }
      />

      {isLoading ? (
        <Card className="text-sm text-muted-foreground">Cargando…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">No se pudieron cargar los puntos físicos.</Card>
      ) : (
        <div className="space-y-4">
          {sucursales.length === 0 && (
            <Card className="text-sm text-muted-foreground">
              Todavía no hay sucursales. Creá una o sincronizá las que haya en Ecart Pay.
            </Card>
          )}
          {sucursales.map((s) => (
            <SucursalCard
              key={s.id}
              sucursal={s}
              terminales={terminales}
              ocupado={ocupado}
              onEditar={() => setSucursalForm({ s })}
              onBorrar={() => setBaja({ tipo: "sucursal", s })}
              onNuevaCaja={() => setCajaForm({ sucursalId: s.id, c: null })}
              onEditarCaja={(c) => setCajaForm({ sucursalId: s.id, c })}
              onBorrarCaja={(c) => setBaja({ tipo: "caja", c })}
              onVincular={(c, terminalId) =>
                m.vincular.mutate(
                  { cajaId: c.id, terminalId },
                  {
                    onSuccess: () =>
                      toast.success(terminalId ? "Terminal vinculada" : "Terminal desvinculada"),
                    onError: avisar,
                  },
                )
              }
            />
          ))}

          <Card>
            <h2 className="font-semibold">Terminales</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Las terminales que Ecart Pay asignó a la cuenta. Vinculá cada una a una caja.
            </p>
            {terminales.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No hay terminales en la cuenta. Cuando Ecart Pay asigne una, tocá "Sincronizar con
                Ecart Pay".
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border text-sm">
                {terminales.map((t) => (
                  <li key={t.id} className="py-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-xs">{t.serie ?? t.id_externo}</span>
                    <Badge tone={t.es_punto_venta ? "success" : "neutral"}>
                      {t.es_punto_venta ? "Punto de venta" : "Independiente"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="text-xs text-muted-foreground">
            Cobrar desde una caja todavía no está disponible: Ecart Pay no publicó cómo enviar un
            cobro a una terminal.
          </p>
        </div>
      )}

      <SucursalDialog
        open={!!sucursalForm}
        sucursal={sucursalForm?.s ?? null}
        guardando={m.guardarSucursal.isPending}
        onClose={() => setSucursalForm(null)}
        onGuardar={(s) =>
          m.guardarSucursal.mutate(s, {
            onSuccess: () => {
              toast.success(s.id ? "Sucursal actualizada" : "Sucursal creada");
              setSucursalForm(null);
            },
            onError: avisar,
          })
        }
      />
      <CajaDialog
        open={!!cajaForm}
        sucursalId={cajaForm?.sucursalId ?? null}
        caja={cajaForm?.c ?? null}
        guardando={m.guardarCaja.isPending}
        onClose={() => setCajaForm(null)}
        onGuardar={(c) =>
          m.guardarCaja.mutate(c, {
            onSuccess: () => {
              toast.success(c.id ? "Caja actualizada" : "Caja creada");
              setCajaForm(null);
            },
            onError: avisar,
          })
        }
      />
      <ConfirmDialog
        open={!!baja}
        onClose={() => setBaja(null)}
        variant="danger"
        closeOnConfirm
        title={baja?.tipo === "sucursal" ? "Dar de baja la sucursal" : "Dar de baja la caja"}
        confirmLabel="Dar de baja"
        message={
          baja?.tipo === "sucursal"
            ? `Se da de baja "${baja.s.nombre}" y sus cajas, también en Ecart Pay.`
            : `Se da de baja "${baja?.tipo === "caja" ? baja.c.nombre : ""}", también en Ecart Pay.`
        }
        onConfirm={async () => {
          if (!baja) return;
          try {
            if (baja.tipo === "sucursal") await m.borrarSucursal.mutateAsync(baja.s.id);
            else await m.borrarCaja.mutateAsync(baja.c.id);
            toast.success("Dado de baja");
          } catch (e) {
            avisar(e);
            throw e;
          }
        }}
      />
    </>
  );
}
