import { useState } from "react";
import { toast } from "sonner";
import { historial, servicios } from "../data";
import type { Item, SectionTab, Tab } from "../types";
import {
  daysUntil,
  filtrarHistorial,
  nuevoServicio,
  ordenarPorVencimiento,
  ordenarServicios,
  totalAPagar,
} from "../utils";

/** Estado de la pantalla de servicios: tabs, filtros, alta de suscripción y diálogos. */
export function usePantallaServicios() {
  const [pagar, setPagar] = useState<Item | null>(null);
  const [tab, setTab] = useState<Tab>("servicios");
  const [remesaOpen, setRemesaOpen] = useState(false);
  const [catFilt, setCatFilt] = useState("Todos");
  const [sort, setSort] = useState("vencimiento");

  const [hCat, setHCat] = useState("Todas");
  const [hStatus, setHStatus] = useState("Todos");
  const [hDesde, setHDesde] = useState("");
  const [sectionTab, setSectionTab] = useState<SectionTab>("proximos");
  // "Ver todos" de cada sección; vive acá para que no se pierda al cambiar de sección.
  const [verTodos, setVerTodos] = useState<Record<SectionTab, boolean>>({
    proximos: false,
    suscritos: false,
    disponibles: false,
    historial: false,
  });
  const toggleVerTodos = (s: SectionTab) => setVerTodos((v) => ({ ...v, [s]: !v[s] }));
  const [editarServicio, setEditarServicio] = useState<Item | null>(null);
  const [nuevos, setNuevos] = useState<Item[]>([]);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [catNueva, setCatNueva] = useState("Servicios publicos");
  const [numeroNuevo, setNumeroNuevo] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const addSuscripcion = () => {
    if (!numeroNuevo.trim()) return;
    const nuevo = nuevoServicio(nombreNuevo, catNueva, numeroNuevo);
    setNuevos((prev) => [nuevo, ...prev]);
    setNumeroNuevo("");
    setNombreNuevo("");
    toast.success("Servicio suscrito: " + nuevo.n);
    setSectionTab("suscritos");
  };

  const todos = [...servicios, ...nuevos];
  const sorted = ordenarServicios(todos, sort);
  const filtrados = catFilt === "Todos" ? sorted : sorted.filter((s) => s.cat === catFilt);
  const prox = ordenarPorVencimiento(filtrados);

  const suscritos = filtrados.filter((s) => s.suscrito);
  const disponibles = todos.filter((s) => !s.suscrito);

  const totalAdheridos = todos.filter((s) => s.suscrito).length;
  const totalPagarMes = totalAPagar(prox);
  const totalVencidos = prox.filter((s) => daysUntil(s.venc) < 0).length;

  const hFiltrados = filtrarHistorial(historial, { cat: hCat, status: hStatus, desde: hDesde });

  return {
    tab,
    setTab,
    sectionTab,
    setSectionTab,
    verTodos,
    toggleVerTodos,
    pagar,
    setPagar,
    remesaOpen,
    setRemesaOpen,
    editarServicio,
    setEditarServicio,
    scanOpen,
    setScanOpen,
    catFilt,
    setCatFilt,
    sort,
    setSort,
    historialFiltros: { hCat, setHCat, hStatus, setHStatus, hDesde, setHDesde },
    alta: {
      nombreNuevo,
      setNombreNuevo,
      catNueva,
      setCatNueva,
      numeroNuevo,
      setNumeroNuevo,
      addSuscripcion,
    },
    prox,
    suscritos,
    disponibles,
    hFiltrados,
    totalAdheridos,
    totalPagarMes,
    totalVencidos,
  };
}

export type PantallaServicios = ReturnType<typeof usePantallaServicios>;
