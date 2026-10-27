import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useOnboarding } from "@/lib/onboarding-store";
import { updateCliente, type Cliente } from "@/lib/api/cuenta";
import { useClienteSesion, useResumenCuenta } from "@/hooks/useCuenta";
import { ESTADO_LABEL, normalizarEstado } from "@/lib/cliente-estados";
import type { CampoTexto, ClienteForm } from "../types";
import { antiguedad, clienteToForm, formToPatch, mapDocumentos, scoreSeguridad } from "../utils";

/**
 * Datos de "Mi cuenta": ficha del cliente (con lo cargado en el onboarding como
 * respaldo), formulario editable, documentos KYC y métricas de la cabecera.
 */
export function useCuentaPantalla() {
  const { cliente, isLoading: loadingCliente, setCliente } = useClienteSesion();
  const resumen = useResumenCuenta(cliente?.legajo);
  const loadingDocs = loadingCliente || (!!cliente && resumen.isLoading);
  const kycDocs = useMemo(() => mapDocumentos(resumen.documentos), [resumen.documentos]);
  const [form, setForm] = useState<Partial<ClienteForm>>({});
  const [saving, setSaving] = useState(false);
  const { tipoCuenta, registro, datosPersonales, datosEmpresa, kyc, emailValidado } =
    useOnboarding();

  const isPJ = cliente?.tipo_persona
    ? cliente.tipo_persona === "juridica"
    : tipoCuenta === "juridica";
  const estadoNorm = cliente?.estado
    ? normalizarEstado(cliente.estado)
    : emailValidado
      ? ("registrado" as const)
      : ("pendiente_verificacion" as const);
  const aprobado = estadoNorm === "activado";

  const [userNombre, userApellido] = (cliente?.nombre ?? "").split(" ");

  const dp = {
    genero: cliente?.genero ?? datosPersonales.genero ?? "",
    cuitCuil: cliente?.cuit_cuil ?? "",
    taxId: cliente?.tax_id ?? datosPersonales.taxId ?? "",
    idPersonal: cliente?.id_personal ?? datosPersonales.idPersonal ?? "",
    ocupacion: cliente?.ocupacion ?? datosPersonales.ocupacion ?? "",
    origenFondos: cliente?.origen_fondos ?? datosPersonales.origenFondos ?? "",
    esPEP: cliente?.es_pep ?? datosPersonales.esPEP ?? false,
  };

  const empresaInfo = {
    nombreLegal: cliente?.nombre_legal ?? datosEmpresa.nombreLegal ?? "",
    nombreFantasia: cliente?.nombre_fantasia ?? datosEmpresa.nombreFantasia ?? "",
    cuit: cliente?.cuit ?? "",
    taxId: cliente?.tax_id ?? datosEmpresa.taxId ?? "",
    tipoId: cliente?.tipo_sociedad ?? datosEmpresa.tipoId ?? "",
    fechaInscripcion: cliente?.fecha_inscripcion ?? datosEmpresa.fechaInscripcion ?? "",
  };

  const dir = {
    direccion: cliente?.direccion ?? kyc.direccion ?? "",
    ciudad: cliente?.ciudad ?? kyc.ciudad ?? "",
    provincia: cliente?.provincia ?? kyc.provincia ?? "",
    cp: cliente?.cp ?? "",
  };

  const cbu = { cbu: cliente?.cbu ?? "—", alias: cliente?.alias ?? "—" };

  const setF = (k: CampoTexto, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (cliente) setForm(clienteToForm(cliente));
  }, [cliente]);

  const cancelar = () => cliente && setForm(clienteToForm(cliente));

  const guardar = async () => {
    if (!cliente) return;
    setSaving(true);
    try {
      const patch = formToPatch(form);
      await updateCliente(cliente.legajo, patch);
      setCliente({ ...cliente, ...patch, cuit: patch.cuit ?? cliente.cuit } as Cliente);
      toast.success("Cambios guardados");
    } catch {
      toast.error("No se pudieron guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const base = cliente?.fecha_alta
    ? new Date(cliente.fecha_alta)
    : cliente?.created_at
      ? new Date(cliente.created_at)
      : null;

  return {
    cliente,
    isPJ,
    estadoNorm,
    estadoLabel: ESTADO_LABEL[estadoNorm],
    aprobado,
    userNombre,
    userApellido,
    userEmail: cliente?.correo ?? registro.email ?? "",
    userNac: cliente?.fecha_nacimiento ?? registro.fechaNac ?? "",
    dp,
    empresaInfo,
    dir,
    cbu,
    form,
    setF,
    saving,
    guardar,
    cancelar,
    kycDocs,
    loadingDocs,
    movCount: resumen.movimientosMes,
    antiguedad: antiguedad(base),
    score: scoreSeguridad(cliente, aprobado, kycDocs.length),
  };
}

export type CuentaPantalla = ReturnType<typeof useCuentaPantalla>;
