import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthShell, PrimaryButton, SecondaryButton, SuccessCard } from "@/components/onboarding";
import { requireSupabase } from "@/lib/supabase";
import { ESTADO_LABEL, normalizarEstado, siguientePasoOnboarding } from "@/lib/cliente-estados";
import { brand, pageTitle, mailto } from "@/brand/brand";

export const Route = createFileRoute("/onboarding/en-proceso")({
  head: () => ({
    meta: [
      { title: pageTitle("Solicitud enviada") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EnProceso,
});

function EnProceso() {
  const nav = useNavigate();
  const [estado, setEstado] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasDocs, setHasDocs] = useState<boolean | null>(null);
  const [tipoPersona, setTipoPersona] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = requireSupabase();
        const { data: u } = await s.auth.getUser();
        const mail = u.user?.email;
        if (!mail) { setLoading(false); return; }
        const { data: cli } = await s.from("clientes").select("estado, onboarding_completo, legajo, tipo_persona").eq("correo", mail).maybeSingle();
        if (cli?.estado) setEstado(cli.estado as string);
        if ((cli as any)?.tipo_persona) setTipoPersona((cli as any).tipo_persona as string);
        if (cli && (cli as any).legajo) {
          try {
            const { data: val } = await s.from("validaciones").select("id").eq("cliente_legajo", (cli as any).legajo).limit(1).maybeSingle();
            const { data: doc } = await s.from("documentos").select("id").eq("cliente_legajo", (cli as any).legajo).limit(1).maybeSingle();
            setHasDocs(!!val || !!doc);
          } catch { setHasDocs(false); }
        }
      } catch {
        // noop
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const norm = estado ? normalizarEstado(estado) : null;
  const label = norm ? ESTADO_LABEL[norm] : "En proceso";
  const paso = norm ? siguientePasoOnboarding(norm) : "Tu alta fue registrada y esta siendo validada por nuestro equipo de compliance.";

  if (loading) {
    return (
      <AuthShell leftEyebrow="Paso 6 · Revision" leftTitle="Cargando tu estado..." leftBody="Consultando el estado de tu solicitud." step="Cargando...">
        <SuccessCard variant="loading" title="Cargando..." body={<p>Un momento, estamos verificando tu estado.</p>} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      leftEyebrow="Paso 6 · Revision"
      leftTitle="Tu solicitud fue enviada."
      leftBody={paso}
      step={label}
    >
      <SuccessCard
        variant={norm === "deshabilitado" || norm === "eliminado" ? "error" : norm === "activado" ? "success" : "info"}
        title={norm ? label : "Solicitud enviada"}
        body={
          <>
            <p>
              {norm === "pendiente_verificacion" && "Verifica tu correo para pasar a Registrado."}
              {norm === "registrado" && "Tu documentacion esta en revision. Permaneceras en Registrado hasta que Admin apruebe."}
              {norm === "preactivado" && "Documentacion aprobada (Preactivado). Falta generar tu CBU y cargar tu comision para activar."}
              {norm === "activado" && "Tu cuenta ya esta Activada. Podes operar."}
              {norm === "suspendido" && "Tu cuenta esta Suspendida temporalmente. Contacta a soporte."}
              {norm === "deshabilitado" && "Tu cuenta fue Deshabilitada. CBU cancelado, historial conservado para auditoria BCRA."}
              {norm === "eliminado" && "Tu cuenta fue Eliminada."}
              {!norm && "Tu alta fue registrada y esta siendo validada por nuestro equipo de compliance. Este proceso puede demorar hasta 24 horas habiles. Te avisaremos por correo cuando quede habilitada."}
            </p>
            <p className="mt-3 text-xs text-black-400">
              Si tenés algún problema,{" "}
              <a href={mailto(brand.contact.support)} className="underline underline-offset-2 hover:text-primary-ink">
                contactanos
              </a>
              .
            </p>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => nav({ to: norm === "activado" ? "/app" : "/login" })}>
            {norm === "activado" ? "Ir al dashboard" : "Ir a iniciar sesion"}
          </PrimaryButton>
          {norm === "registrado" && hasDocs && (
            <SecondaryButton onClick={() => nav({ to: "/onboarding/datos-personales" })}>
              Editar información y reenviar
            </SecondaryButton>
          )}
          {norm === "pendiente_verificacion" && (
            <SecondaryButton onClick={() => nav({ to: "/login" })}>
              Reenviar verificación
            </SecondaryButton>
          )}
        </div>
      </SuccessCard>
    </AuthShell>
  );
}
