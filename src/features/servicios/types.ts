import type { LucideIcon } from "lucide-react";

export type EstadoServicio = "Pendiente" | "Proximo" | "Vencido";
export type EstadoPagoServicio = "Pagado" | "Vencido" | "Cancelado";

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

export type SectionTab = "proximos" | "suscritos" | "disponibles" | "historial";
