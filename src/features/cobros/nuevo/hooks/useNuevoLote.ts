import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  crearLoteDB,
  generateId,
  getLegajoUsuario,
  type Lote,
  type MedioPago,
} from "@/lib/api/cobros-masivos";
import { filasARegistros, type FilaCarga } from "../../carga";
import { validarParametros, type ParametrosLote } from "../../utils";

const manana = () => format(new Date(Date.now() + 86400000), "yyyy-MM-dd");

/** Parámetros generales del lote nuevo, validación del paso 1 y guardado. */
export function useNuevoLote() {
  const navigate = useNavigate();
  const tomorrow = manana();
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [params, setParams] = useState<ParametrosLote>(() => ({
    nombre: "",
    periodo: format(new Date(), "yyyy-MM"),
    diaProcesamiento: 15,
    tasaInteres: 10,
    fechaVenc1: manana(),
    fechaVenc2: "",
    fechaVenc3: "",
    mediosPago: ["TRANSFERENCIA", "TARJETA_CREDITO", "TARJETA_DEBITO"],
    pagosParciales: true,
    notificaciones: false,
  }));

  const set = <K extends keyof ParametrosLote>(k: K, v: ParametrosLote[K]) =>
    setParams((p) => ({ ...p, [k]: v }));

  const toggleMedio = (m: MedioPago) =>
    setParams((p) => ({
      ...p,
      mediosPago: p.mediosPago.includes(m)
        ? p.mediosPago.filter((x) => x !== m)
        : [...p.mediosPago, m],
    }));

  const siguienteDesdeParametros = () => {
    const error = validarParametros(params, tomorrow);
    if (error) toast.error(error);
    else setPaso(1);
  };

  const guardar = async (filas: FilaCarga[]) => {
    setGuardando(true);
    try {
      const loteId = generateId("LOT");
      const now = format(new Date(), "yyyy-MM-dd HH:mm:ss");
      const p = params;

      const lote: Lote = {
        id: loteId,
        nombre: p.nombre,
        periodo: p.periodo,
        diaProcesamiento: String(p.diaProcesamiento),
        estado: "cargado",
        tasaInteres: p.tasaInteres,
        fechaVencimiento1: p.fechaVenc1,
        fechaVencimiento2: p.fechaVenc2 || null,
        fechaVencimiento3: p.fechaVenc3 || null,
        mediosPago: p.mediosPago,
        pagosParcialesHabilitado: p.pagosParciales,
        notificacionesHabilitado: p.notificaciones,
        createdAt: now,
        fechaInicio: null,
        fechaFinalizacion: null,
      };

      const registros = filasARegistros(filas, loteId, p.mediosPago, p.pagosParciales, () =>
        generateId("REG"),
      );

      const legajo = await getLegajoUsuario();
      if (!legajo) {
        toast.error("No se pudo identificar el usuario");
        return;
      }

      const result = await crearLoteDB(lote, registros, legajo);
      if (!result.ok) {
        toast.error("Error al guardar: " + (result.error ?? "desconocido"));
        return;
      }

      toast.success(`Lote "${p.nombre}" creado con ${filas.length} registros`, {
        description: "El lote quedo en estado Pendiente de procesamiento",
      });
      navigate({ to: "/app/cobros/gestion" });
    } finally {
      setGuardando(false);
    }
  };

  return {
    paso,
    setPaso,
    params,
    set,
    toggleMedio,
    siguienteDesdeParametros,
    guardando,
    guardar,
    volverAGestion: () => navigate({ to: "/app/cobros/gestion" }),
  };
}
