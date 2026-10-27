import { createFileRoute } from "@tanstack/react-router";
import { brand } from "@/brand/brand";
import { Hero } from "@/features/landing/components/Hero";
import {
  MisionVision,
  PorQueElegirnos,
  RegulatoryStrip,
} from "@/features/landing/components/Institucional";
import { ContamosCon, LedgerStrip, Servicios } from "@/features/landing/components/Servicios";
import { SiteFooter } from "@/features/landing/components/SiteFooter";
import { SiteHeader } from "@/features/landing/components/SiteHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Soluciones financieras digitales` },
      {
        name: "description",
        content: `${brand.name} integra pagos, cobros y remesas para empresas y particulares en América Latina. Plataforma regulada bajo marco normativo BCRA.`,
      },
      { property: "og:title", content: `${brand.name} — Soluciones financieras digitales` },
      {
        property: "og:description",
        content:
          "Cuenta de pago, Crossborder, CVU Collect y Billetera. Plataforma tecnológica escalable y regulada.",
      },
      { property: "og:image", content: brand.assets.ogImage.src },
      { property: "og:image:width", content: String(brand.assets.ogImage.width) },
      { property: "og:image:height", content: String(brand.assets.ogImage.height) },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: brand.assets.ogImage.src },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="bg-white text-black-700">
      <SiteHeader />
      <Hero />
      <LedgerStrip />
      <Servicios />
      <ContamosCon />
      <MisionVision />
      <PorQueElegirnos />
      <RegulatoryStrip />
      <SiteFooter />
    </div>
  );
}
