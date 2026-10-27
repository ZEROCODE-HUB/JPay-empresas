import type { ReactNode } from "react";
import { Mail, QrCode, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { brand } from "@/brand/brand";
import { Badge, BtnOutline, BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import type { MetodoDosFactores, useDosFactores } from "../hooks/useDosFactores";

function OpcionMetodo({
  activo,
  onClick,
  icon,
  titulo,
  descripcion,
}: {
  activo: boolean;
  onClick: () => void;
  icon: ReactNode;
  titulo: string;
  descripcion: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left border rounded-lg p-3 transition ${
        activo
          ? "border-primary bg-[color:var(--brand-primary-50)]"
          : "hover:border-primary/50 bg-card"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-semibold text-sm">{titulo}</span>
        {activo && <Badge tone="success">Activo</Badge>}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{descripcion}</p>
    </button>
  );
}

/** Bloque QR + clave + código; `qr` y `children` cambian entre la demo y el alta real. */
function BloqueQr({ qr, clave, children }: { qr: ReactNode; clave: string; children: ReactNode }) {
  return (
    <div className="mt-4 border rounded-lg p-4 bg-muted/40">
      <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-4 items-start">
        <div className="w-32 h-32 rounded-md bg-white border grid place-items-center shrink-0">
          {qr}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            Escanea el QR con Google Authenticator
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            O ingresa manualmente la clave:
          </div>
          <div className="font-mono text-xs mt-1 p-2 bg-card border rounded break-all">{clave}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function DosFactoresCard({ f }: { f: ReturnType<typeof useDosFactores> }) {
  const elegir = (m: MetodoDosFactores) => () => f.setMetodo(m);
  return (
    <Card>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="font-semibold flex items-center gap-2 min-w-0">
          <Smartphone size={16} className="shrink-0" />{" "}
          <span className="truncate">Doble factor (2FA)</span>
        </h3>
        <Badge tone="success">Activo</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Elegi el metodo de verificacion en dos pasos que preferis usar al iniciar sesion desde un
        dispositivo nuevo.
      </p>

      <div className="grid sm:grid-cols-2 gap-2 mt-4">
        <OpcionMetodo
          activo={f.metodo === "email"}
          onClick={elegir("email")}
          icon={<Mail size={16} className="text-primary-ink shrink-0" />}
          titulo="Codigo por email"
          descripcion="Enviamos un codigo de 8 digitos a tu correo corporativo."
        />
        <OpcionMetodo
          activo={f.metodo === "totp"}
          onClick={elegir("totp")}
          icon={<QrCode size={16} className="text-primary-ink shrink-0" />}
          titulo="Google Authenticator"
          descripcion="Codigo TOTP de 6 digitos generado en tu app (Google / 1Password / Authy)."
        />
      </div>

      {f.metodo === "totp" && (
        <BloqueQr
          qr={<QrCode size={96} strokeWidth={1} className="text-foreground" />}
          clave={`JBSWY3DPEHPK3PXP-${brand.name.toUpperCase()}-EMPRESA-DEMO`}
        >
          <div className="mt-3">
            <Label>Codigo de verificacion</Label>
            <Input placeholder="123 456" inputMode="numeric" maxLength={6} />
          </div>
        </BloqueQr>
      )}

      <div className="flex gap-2 mt-4">
        <BtnPrimary className="flex-1" onClick={f.guardar}>
          Guardar metodo 2FA
        </BtnPrimary>
        <BtnOutline onClick={() => toast.success("Codigos de respaldo enviados a tu correo")}>
          Codigos de respaldo
        </BtnOutline>
      </div>

      {f.enroll && (
        <BloqueQr
          qr={
            f.enroll.qr && (
              <img src={f.enroll.qr} alt="QR para configurar 2FA" className="w-full h-full" />
            )
          }
          clave={f.enroll.secret}
        >
          <div className="mt-3">
            <Label>Codigo de verificacion</Label>
            <Input
              value={f.verifyCode}
              onChange={(e) => f.setVerifyCode(e.target.value)}
              placeholder="123 456"
              inputMode="numeric"
              maxLength={6}
            />
          </div>
          <BtnPrimary className="mt-3 w-full" onClick={f.verificar}>
            Activar 2FA
          </BtnPrimary>
        </BloqueQr>
      )}
    </Card>
  );
}
