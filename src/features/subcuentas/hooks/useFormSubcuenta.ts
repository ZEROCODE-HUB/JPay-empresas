import { useState } from "react";
import { toast } from "sonner";
import { createSubcuenta, updateSubcuenta } from "@/lib/api/subcuentas";
import type { FormSubcuenta, Sub } from "../types";
import { generarCvu } from "../utils";

const FORM_VACIO: FormSubcuenta = {
  n: "",
  apellido: "",
  email: "",
  tipo: "Operativa",
  resp: "",
  lim: "",
  saldo: "",
  activar: true,
};

/** Alta y edición de una subcuenta (diálogo "Nueva / Editar subcuenta"). */
export function useFormSubcuenta(clienteLegajo: string | null, recargar: () => Promise<void>) {
  const [open, setOpen] = useState(false);
  const [editSub, setEditSub] = useState<Sub | null>(null);
  const [form, setForm] = useState<FormSubcuenta>(FORM_VACIO);

  const abrirNuevo = () => {
    setEditSub(null);
    setForm(FORM_VACIO);
    setOpen(true);
  };

  const abrirEditar = (s: Sub) => {
    setEditSub(s);
    setForm({
      n: s.n,
      apellido: s.apellido,
      email: s.email,
      tipo: s.tipo,
      resp: s.resp,
      lim: s.lim,
      saldo: String(s.disp),
      activar: s.e === "Activa",
    });
    setOpen(true);
  };

  const cerrar = () => {
    setOpen(false);
    setEditSub(null);
  };

  const guardar = async () => {
    if (!clienteLegajo) {
      toast.error("No se pudo identificar la cuenta");
      return;
    }
    try {
      if (editSub && editSub.id) {
        await updateSubcuenta(editSub.id, {
          nombre: form.n,
          apellido: form.apellido,
          email: form.email,
          tipo: form.tipo,
          responsable: form.resp,
          limite: form.lim || null,
        });
        toast.success("Subcuenta actualizada");
      } else {
        // Antes el CVU daba 19 dígitos y el banco lo rechazaba como origen.
        // El saldo nace en 0 (trigger en subaccounts); el cliente no puede fijarlo.
        await createSubcuenta({
          cliente_legajo: clienteLegajo,
          nombre: form.n,
          apellido: form.apellido,
          email: form.email,
          tipo: form.tipo,
          responsable: form.resp,
          limite: form.lim || null,
          cbu: generarCvu(),
          estado: form.activar ? "Activa" : "Pausada",
          ingresos: "",
          egresos: "",
          retiros_habilitados: true,
        });
        toast.success("Subcuenta creada correctamente");
      }
      cerrar();
      await recargar();
    } catch {
      toast.error("No se pudo guardar la subcuenta");
    }
  };

  return { open, editSub, form, setForm, abrirNuevo, abrirEditar, cerrar, guardar };
}
