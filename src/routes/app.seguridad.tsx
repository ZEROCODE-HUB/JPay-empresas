import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/portal-shell";
import { CambiarPasswordCard } from "@/features/seguridad/components/CambiarPasswordCard";
import { DosFactoresCard } from "@/features/seguridad/components/DosFactoresCard";
import { EquipoCard, InvitarMiembroDialog } from "@/features/seguridad/components/EquipoCard";
import { RegistroActividadCard } from "@/features/seguridad/components/RegistroActividadCard";
import { SesionesCard } from "@/features/seguridad/components/SesionesCard";
import { useCambioPassword } from "@/features/seguridad/hooks/useCambioPassword";
import { useDosFactores } from "@/features/seguridad/hooks/useDosFactores";
import { useEquipo } from "@/features/seguridad/hooks/useEquipo";
import { useSesiones } from "@/features/seguridad/hooks/useSesiones";

export const Route = createFileRoute("/app/seguridad")({ component: Page });

function Page() {
  const password = useCambioPassword();
  const dosFactores = useDosFactores();
  const sesiones = useSesiones();
  const equipo = useEquipo();

  return (
    <>
      <PageHeader
        title="Seguridad"
        description="Contrasena, 2FA, sesiones activas, equipo y auditoria."
      />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <CambiarPasswordCard p={password} />
        <div className="space-y-6">
          <DosFactoresCard f={dosFactores} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6 mb-6">
        <SesionesCard s={sesiones} />
        <EquipoCard eq={equipo} />
      </div>

      <RegistroActividadCard />

      <InvitarMiembroDialog eq={equipo} />
    </>
  );
}
