import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  borrarPersonaKyb,
  cambiarSubcuentaReceptora,
  consultarVerificacion,
  convertirDolares,
  cotizarDolares,
  crearCobroR2p,
  crearDestinatarioSpei,
  crearDestinatarioUsd,
  enviarLoteSpei,
  enviarTransferenciaSpei,
  getCuentaCobre,
  getDatosKyb,
  guardarEmpresaKyb,
  guardarPersonaKyb,
  listCobrosR2p,
  listConversiones,
  listDepositosSpei,
  listDestinatariosSpei,
  listLotesSpei,
  listSubcuentasSpei,
  listTransferenciasSpei,
} from "@/lib/api/cobre";
import type { PersonaKyb } from "@/shared/cobre-kyb";
import type { EmpresaKyb } from "@/shared/ui/kyb-cobre";

const KEY = ["cobre"] as const;

const abiertas = (estados: string[]) =>
  estados.some(
    (e) => e === "enviando" || e === "trasladando" || e.startsWith("pendiente") || e === "creando",
  );

export function useCuentaSpei() {
  const transferencias = useQuery({
    queryKey: [...KEY, "transferencias"],
    queryFn: () => listTransferenciasSpei(),
    // Mientras haya envíos abiertos se refresca seguido (el estado llega por aviso de Cobre).
    refetchInterval: (q) => (abiertas((q.state.data ?? []).map((t) => t.estado)) ? 5_000 : 30_000),
  });
  const destinatarios = useQuery({
    queryKey: [...KEY, "destinatarios"],
    queryFn: listDestinatariosSpei,
    // La verificación de titular es asíncrona (minutos): se refresca mientras haya alguna en curso.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((d) => d.verificacion === "procesando") ? 10_000 : false,
  });
  return {
    cuenta: useQuery({ queryKey: [...KEY, "cuenta"], queryFn: getCuentaCobre }),
    subcuentas: useQuery({ queryKey: [...KEY, "subcuentas"], queryFn: listSubcuentasSpei }),
    destinatarios,
    transferencias,
    lotes: useQuery({
      queryKey: [...KEY, "lotes"],
      queryFn: () => listLotesSpei(),
      refetchInterval: (q) =>
        (q.state.data ?? []).some(
          (l) => !["completed", "failed", "canceled", "error_envio"].includes(l.estado),
        )
          ? 5_000
          : 30_000,
    }),
    depositos: useQuery({
      queryKey: [...KEY, "depositos"],
      queryFn: () => listDepositosSpei(),
      refetchInterval: 30_000,
    }),
  };
}

export function useCuentaSpeiMutaciones() {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    receptora: useMutation({ mutationFn: cambiarSubcuentaReceptora, onSuccess: refrescar }),
    crearDestinatario: useMutation({ mutationFn: crearDestinatarioSpei, onSuccess: refrescar }),
    crearDestinatarioUsd: useMutation({ mutationFn: crearDestinatarioUsd, onSuccess: refrescar }),
    verificar: useMutation({ mutationFn: consultarVerificacion, onSuccess: refrescar }),
    enviar: useMutation({ mutationFn: enviarTransferenciaSpei, onSettled: refrescar }),
    lote: useMutation({ mutationFn: enviarLoteSpei, onSettled: refrescar }),
  };
}

export function useCobrosR2p() {
  const qc = useQueryClient();
  const cobros = useQuery({
    queryKey: [...KEY, "r2p"],
    queryFn: () => listCobrosR2p(),
    refetchInterval: (q) => (abiertas((q.state.data ?? []).map((c) => c.estado)) ? 5_000 : 30_000),
  });
  return {
    cobros,
    crear: useMutation({
      mutationFn: crearCobroR2p,
      onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    }),
  };
}

export function useDolares() {
  const qc = useQueryClient();
  const conversiones = useQuery({
    queryKey: [...KEY, "conversiones"],
    queryFn: () => listConversiones(),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((c) => ["enviando", "initiated", "processing"].includes(c.estado))
        ? 5_000
        : 30_000,
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    conversiones,
    cotizar: useMutation({
      mutationFn: (v: { subcuentaId: string; montoMxn: number }) =>
        cotizarDolares(v.subcuentaId, v.montoMxn),
    }),
    convertir: useMutation({ mutationFn: convertirDolares, onSettled: refrescar }),
  };
}

export function useKybCobre() {
  const qc = useQueryClient();
  const datos = useQuery({ queryKey: [...KEY, "kyb"], queryFn: getDatosKyb });
  const refrescar = () => qc.invalidateQueries({ queryKey: KEY });
  const legajo = () => {
    if (!datos.data) throw new Error("Cliente no encontrado");
    return datos.data.legajo;
  };
  return {
    datos,
    guardarEmpresa: (e: EmpresaKyb) => guardarEmpresaKyb(legajo(), e).then(refrescar),
    guardarPersona: (p: PersonaKyb) => guardarPersonaKyb(legajo(), p).then(refrescar),
    borrarPersona: (id: string) => borrarPersonaKyb(id).then(refrescar),
  };
}
