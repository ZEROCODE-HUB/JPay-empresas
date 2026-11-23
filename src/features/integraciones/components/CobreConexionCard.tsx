import { useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary, Card, Input } from "@/components/portal-shell";
import { useConexionCobre, useConexionCobreMutaciones } from "@/hooks/useIntegraciones";
import { formatDateTime } from "@/shared/format";
import { mensajeError } from "@/shared/errores";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { brand } from "@/brand/brand";

/**
 * Cuenta Cobre propia del cliente: la conecta con su usuario y clave de API de Cobre. Con eso
 * su CLABE de Cobre queda como su cuenta para recibir y enviar SPEI en {brand.name}, y los
 * movimientos llegan por aviso. Las claves se guardan cifradas en el servidor y no se vuelven
 * a mostrar.
 */
export function CobreConexionCard() {
  const { data: c, isLoading, error, refetch } = useConexionCobre();
  const { conectar, desconectar } = useConexionCobreMutaciones();
  const [abierto, setAbierto] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [faltantes, setFaltantes] = useState<string[]>([]);

  if (isLoading) return <Card className="text-sm text-black-400">Cargando…</Card>;
  if (error || !c) {
    return (
      <Card className="text-sm text-danger-600">
        No se pudo leer tu cuenta Cobre.{" "}
        <button className="underline" onClick={() => void refetch()}>
          Reintentar
        </button>
      </Card>
    );
  }

  const enviar = () => {
    if (!usuario.trim() || !clave.trim()) return toast.error("Escribe tu usuario y tu clave");
    conectar.mutate(
      { user_id: usuario.trim(), secret: clave.trim() },
      {
        onSuccess: (r) => {
          setClave("");
          setAbierto(false);
          setFaltantes(r.faltantes ?? []);
          if (r.faltantes?.length) toast.warning("Cuenta conectada, pero faltaron algunos pasos");
          else toast.success("Tu cuenta Cobre quedó conectada");
        },
        onError: (e) => toast.error(mensajeError(e)),
      },
    );
  };

  const clabe = c.cuenta?.clabe ?? null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            Cuenta Cobre (SPEI)
            <Badge tone={c.conectada ? "success" : "neutral"}>
              {c.conectada ? "Conectada" : "Sin conectar"}
            </Badge>
            {c.conectada && c.modo !== "produccion" && <Badge tone="warn">Pruebas</Badge>}
          </h2>
          <p className="text-sm text-black-400 mt-1 max-w-xl">
            Conecta tu cuenta de Cobre para recibir y enviar transferencias SPEI desde {brand.name}.
            Tu CLABE de Cobre queda como tu cuenta para depósitos y ahí también llega lo que cobras
            con tarjeta.
          </p>
        </div>
        {c.conectada ? (
          <div className="flex flex-wrap gap-2">
            <BtnOutline onClick={() => setAbierto((v) => !v)}>Actualizar claves</BtnOutline>
            <BtnOutline onClick={() => setConfirmar(true)} disabled={desconectar.isPending}>
              <Unlink size={16} /> Desconectar
            </BtnOutline>
          </div>
        ) : (
          !abierto && (
            <BtnPrimary onClick={() => setAbierto(true)}>
              <Link2 size={16} /> Conectar mi cuenta Cobre
            </BtnPrimary>
          )
        )}
      </div>

      {abierto && (
        <div className="mt-4 rounded-md border border-primary-200 bg-primary-50 p-4">
          <p className="text-sm text-black-500">
            En el portal de Cobre, en la sección de claves de API, copia tu <b>User ID</b> (empieza
            con <span className="font-mono">cli_</span>) y tu <b>clave secreta</b>.
          </p>
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <Input
              aria-label="User ID de Cobre"
              placeholder="User ID (cli_…)"
              value={usuario}
              autoComplete="off"
              onChange={(e) => setUsuario(e.target.value)}
              className="w-56 font-mono"
            />
            <Input
              aria-label="Clave secreta de Cobre"
              type="password"
              placeholder="Clave secreta"
              value={clave}
              autoComplete="new-password"
              onChange={(e) => setClave(e.target.value)}
              className="w-56"
            />
            <BtnPrimary type="submit" disabled={conectar.isPending}>
              {conectar.isPending ? "Conectando…" : "Conectar"}
            </BtnPrimary>
            <BtnOutline type="button" onClick={() => setAbierto(false)}>
              Cancelar
            </BtnOutline>
          </form>
          <p className="mt-2 text-xs text-black-400">
            Probamos tus claves con Cobre antes de guardarlas. Se guardan cifradas y no se vuelven a
            mostrar.
          </p>
        </div>
      )}

      {c.conectada && (
        <dl className="mt-5 grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-black-400">Conectada el</dt>
            <dd>{c.conectada_at ? formatDateTime(c.conectada_at) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-black-400">Tu CLABE</dt>
            <dd className="font-mono">{clabe ?? "Pendiente"}</dd>
          </div>
          <div>
            <dt className="text-xs text-black-400">Avisos de movimientos</dt>
            <dd className="flex items-center gap-1.5">
              {c.avisos ? (
                <>
                  <CheckCircle2 size={14} className="text-success" /> Activos
                </>
              ) : (
                <>
                  <AlertTriangle size={14} className="text-warning" /> Pendientes
                </>
              )}
            </dd>
          </div>
        </dl>
      )}

      {c.conectada && (faltantes.length > 0 || !clabe || !c.avisos) && (
        <div className="mt-4 rounded-md border border-warning bg-warning-bg p-3 text-sm">
          <p className="font-medium">Falta completar la conexión</p>
          {faltantes.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-black-500">
              {faltantes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-black-500">
              {!clabe ? "Todavía no tenemos tu CLABE de Cobre. " : ""}
              {!c.avisos ? "Los avisos de movimientos no están activos. " : ""}
            </p>
          )}
          <p className="mt-1 text-xs text-black-400">
            Usa «Actualizar claves» para reintentar. Si sigue igual, pide a Cobre que active
            Balances México en tu cuenta.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmar}
        onClose={() => setConfirmar(false)}
        title="Desconectar tu cuenta Cobre"
        variant="danger"
        confirmLabel="Desconectar"
        closeOnConfirm
        message={
          <>
            {brand.name} deja de usar tu cuenta Cobre: se borran las claves guardadas y tu CLABE
            deja de recibir depósitos aquí. Tu dinero sigue en tu cuenta de Cobre.
          </>
        }
        onConfirm={() =>
          desconectar.mutateAsync().then(
            () => {
              setFaltantes([]);
              toast.success("Cuenta Cobre desconectada");
            },
            (e) => {
              toast.error(mensajeError(e));
              throw e;
            },
          )
        }
      />
    </Card>
  );
}
