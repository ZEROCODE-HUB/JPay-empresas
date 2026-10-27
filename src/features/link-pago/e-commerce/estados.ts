import type { Ecom } from "./utils";

export const ESTADO_ECOM_TONE: Record<Ecom["estado"], "success" | "neutral"> = {
  Habilitado: "success",
  Deshabilitado: "neutral",
};
