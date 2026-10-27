import type { LucideIcon } from "lucide-react";

export type EstadoServicio = "Pendiente" | "Proximo" | "Vencido";
export type EstadoPagoServicio = "Pagado" | "Vencido" | "Cancelado";
export type EstadoRemesa = "Completado" | "En proceso" | "Rechazado";

/** Servicio (factura) adherido o disponible. Fechas en formato dd/mm/aaaa. */
export type Item = {
  n: string;
  c: string;
  v: string;
  venc: string;
  icon: LucideIcon;
  cat: string;
  e: EstadoServicio;
  suscrito: boolean;
};

export type TxHist = {
  f: string;
  s: string;
  cat: string;
  m: string;
  e: EstadoPagoServicio;
};

export type Remesa = {
  f: string;
  pais: string;
  banco: string;
  mARS: string;
  mDest: string;
  tc: string;
  e: EstadoRemesa;
};

export type Tab = "servicios" | "remesas";
export type SectionTab = "proximos" | "suscritos" | "disponibles" | "historial";
