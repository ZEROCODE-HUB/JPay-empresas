import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  crearDestinatarioSpei,
  enviarTransferenciaSpei,
  generarClabe,
  listDepositosSpei,
  listDestinatariosSpei,
  listSubcuentasSpei,
  listTransferenciasSpei,
} from "@/lib/api/cobre";

const KEY = ["cobre"] as const;

export function useCuentaSpei() {
  const abiertas = (estados: string[]) =>
    estados.some((e) => e === "enviando" || e.startsWith("pendiente"));
  const transferencias = useQuery({
    queryKey: [...KEY, "transferencias"],
    queryFn: () => listTransferenciasSpei(),
    // Mientras haya envíos abiertos se refresca seguido (el estado llega por aviso de Cobre).
    refetchInterval: (q) => (abiertas((q.state.data ?? []).map((t) => t.estado)) ? 5_000 : 30_000),
  });
  return {
    subcuentas: useQuery({ queryKey: [...KEY, "subcuentas"], queryFn: listSubcuentasSpei }),
    destinatarios: useQuery({
      queryKey: [...KEY, "destinatarios"],
      queryFn: listDestinatariosSpei,
    }),
    transferencias,
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
    generarClabe: useMutation({ mutationFn: generarClabe, onSuccess: refrescar }),
    crearDestinatario: useMutation({ mutationFn: crearDestinatarioSpei, onSuccess: refrescar }),
    enviar: useMutation({ mutationFn: enviarTransferenciaSpei, onSettled: refrescar }),
  };
}
