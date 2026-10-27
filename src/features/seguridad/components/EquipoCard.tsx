import { Plus } from "lucide-react";
import { Badge, BtnOutline, Card, Input, Label } from "@/components/portal-shell";
import { FormDialog } from "@/shared/ui/form-dialog";
import { ROLES_EQUIPO, tonoMiembro } from "../estados";
import type { useEquipo } from "../hooks/useEquipo";

type Equipo = ReturnType<typeof useEquipo>;

export function EquipoCard({ eq }: { eq: Equipo }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Usuarios del equipo</h3>
        <BtnOutline className="h-9 px-3 text-xs" onClick={() => eq.setInviteOpen(true)}>
          <Plus size={12} /> Invitar
        </BtnOutline>
      </div>
      <div className="divide-y">
        {eq.team.map((u) => (
          <div key={u.e} className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-semibold">{u.n}</div>
              <div className="text-xs text-muted-foreground">{u.e}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">{u.r}</Badge>
              <Badge tone={tonoMiembro(u.a)}>{u.a}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function InvitarMiembroDialog({ eq }: { eq: Equipo }) {
  return (
    <FormDialog
      open={eq.inviteOpen}
      onClose={() => eq.setInviteOpen(false)}
      title="Invitar miembro del equipo"
      description="Enviá una invitación por email para que se una a tu empresa."
      submitLabel="Enviar invitación"
      onSubmit={eq.invitar}
    >
      <div>
        <Label>Nombre completo</Label>
        <Input
          placeholder="Ej. Juan Pérez"
          value={eq.inviteName}
          onChange={(e) => eq.setInviteName(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <Label>Email</Label>
        <Input
          type="email"
          placeholder="juan@empresa.com"
          value={eq.inviteEmail}
          onChange={(e) => eq.setInviteEmail(e.target.value)}
        />
      </div>
      <div>
        <Label>Rol</Label>
        <select
          className="w-full h-10 px-3 rounded-md border bg-card text-sm"
          value={eq.inviteRole}
          onChange={(e) => eq.setInviteRole(e.target.value)}
        >
          {ROLES_EQUIPO.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground mt-1">
          El invitado quedará en estado Pendiente hasta aceptar.
        </p>
      </div>
    </FormDialog>
  );
}
