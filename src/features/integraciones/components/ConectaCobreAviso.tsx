import { Link } from "@tanstack/react-router";
import { ExternalLink, Link2 } from "lucide-react";
import { Card } from "@/components/portal-shell";
import type { CuentaCobre } from "@/lib/api/cobre";
import { brand } from "@/brand/brand";

const URL_COBRE = "https://www.cobre.com";

/**
 * Aviso de las pantallas de SPEI y dólares cuando el cliente no tiene cuenta Cobre lista:
 * - sin cuenta conectada: «Conecta tu cuenta Cobre» (o créala en Cobre si no tiene);
 * - conectada pero sin CLABE todavía: que revise la conexión.
 * Devuelve null si la cuenta ya está lista.
 */
export function ConectaCobreAviso({
  cuenta,
  para = "usar SPEI",
}: {
  cuenta: CuentaCobre | undefined;
  /** Qué habilita la cuenta, para el texto («enviar transferencias», …). */
  para?: string;
}) {
  if (!cuenta || cuenta.cuenta) return null;
  const conectada = cuenta.instanciaPropia;
  return (
    <Card className="border-primary-200 bg-primary-50">
      <h2 className="font-semibold">
        {conectada ? "Falta tu CLABE de Cobre" : "Conecta tu cuenta Cobre"}
      </h2>
      <p className="mt-1 text-sm text-black-500 max-w-2xl">
        {conectada
          ? `Tu cuenta Cobre ya está conectada, pero todavía no tenemos tu cuenta en pesos (CLABE). Revisa qué falta en Conexiones para ${para}.`
          : `Para ${para} en ${brand.name} necesitas conectar tu cuenta de Cobre. Solo pegas tu User ID y tu clave de API; nosotros hacemos el resto.`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          to="/app/integraciones"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-primary-500 px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-400"
        >
          <Link2 size={16} /> {conectada ? "Ir a Conexiones" : "Conectar mi cuenta Cobre"}
        </Link>
        {!conectada && (
          <a
            href={URL_COBRE}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-secondary hover:underline"
          >
            ¿No tienes cuenta? Créala en Cobre <ExternalLink size={14} />
          </a>
        )}
      </div>
    </Card>
  );
}
