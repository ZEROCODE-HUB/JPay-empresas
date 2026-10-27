import { CheckCircle2, Key } from "lucide-react";
import { BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import type { useCambioPassword } from "../hooks/useCambioPassword";
import type { FormPassword } from "../utils";

const CAMPOS: Array<{ k: keyof FormPassword; label: string }> = [
  { k: "actual", label: "Contrasena actual" },
  { k: "nueva", label: "Nueva contrasena" },
  { k: "repetir", label: "Repetir contrasena" },
];

export function CambiarPasswordCard({ p }: { p: ReturnType<typeof useCambioPassword> }) {
  return (
    <Card>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Key size={16} /> Cambiar contrasena
      </h3>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          p.guardar();
        }}
      >
        {CAMPOS.map(({ k, label }) => (
          <div key={k}>
            <Label>{label}</Label>
            <Input
              type="password"
              value={p.pw[k]}
              onChange={(e) => p.setPw((prev) => ({ ...prev, [k]: e.target.value }))}
            />
          </div>
        ))}
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={11} className="text-emerald-600" /> Minimo 12 caracteres
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={11} className="text-emerald-600" /> Mayusculas, numeros y simbolos
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={11} className="text-muted-foreground" /> Distinta a las ultimas 5
            usadas
          </div>
        </div>
        <BtnPrimary type="submit" disabled={p.saving}>
          {p.saving ? "Actualizando..." : "Actualizar contrasena"}
        </BtnPrimary>
      </form>
    </Card>
  );
}
