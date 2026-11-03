import { getPais } from "@/shared/pais";

/**
 * Nombre de la cuenta bancaria de los clientes según el país de la instalación: "CVU" en
 * Argentina (la que asigna BDC / Coelsa) y "CLABE" en México (la asigna Cobre).
 */
export function cuentaDelPais(): string {
  const pais = getPais();
  return pais.codigo === "AR" ? "CVU" : pais.cuentaBancaria.tipo;
}
