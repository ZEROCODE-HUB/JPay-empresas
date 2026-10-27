import { getPais, regimenesPara, type Identificador, type TipoPersona } from "@/shared/pais";
import { Field, SelectField } from "./campos";

/** Campo de un identificador del país (RFC, CURP, CLABE, CUIT…) con su etiqueta y ayuda. */
export function CampoIdentificador({
  id,
  value,
  onChange,
  error,
  opcional = false,
}: {
  id: Identificador;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  opcional?: boolean;
}) {
  return (
    <Field
      label={opcional ? `${id.etiqueta} (opcional)` : id.etiqueta}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={id.placeholder}
      className="font-mono uppercase"
      autoComplete="off"
      error={error}
      hint={id.ayuda}
    />
  );
}

/** Régimen fiscal del país para el tipo de persona (no se muestra si el país no los usa). */
export function SelectRegimen({
  persona,
  value,
  onChange,
  error,
}: {
  persona: TipoPersona;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const regimenes = regimenesPara(getPais(), persona);
  if (!regimenes.length) return null;
  return (
    <SelectField
      label="Régimen fiscal"
      value={value}
      onChange={onChange}
      options={regimenes.map((r) => ({ value: r.codigo, label: `${r.codigo} · ${r.nombre}` }))}
      error={error}
    />
  );
}
