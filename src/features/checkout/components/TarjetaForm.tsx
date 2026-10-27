import type { RefObject } from "react";
import { CreditCard } from "lucide-react";
import { Input, Label } from "@/components/portal-shell";
import {
  isDevWithTestCard,
  isPaywayTestCardApproved,
  testCardFitsMethod,
} from "@/lib/payway-test-card";
import { cvvMax, formatNro, formatVenc, vencPartes } from "../utils";
import type { CheckoutPago } from "../hooks/useCheckoutPago";

/**
 * Formulario de tarjeta. Los atributos `data-decidir` son los que lee el SDK
 * de Payway para tokenizar: no cambiarlos sin revisar `@/lib/payway*`.
 */
export function TarjetaForm({
  method,
  tarjeta,
  formRef,
}: {
  method: string;
  tarjeta: CheckoutPago["tarjeta"];
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const { titular, setTitular, nro, setNro, venc, setVenc, cvv, setCvv } = tarjeta;
  const { documento, setDocumento } = tarjeta;
  const isAmex = method === "amex";
  const maxCvv = cvvMax(method);
  const { mes: vencMes, anio: vencAnio } = vencPartes(venc);

  return (
    <form
      ref={formRef}
      className="mt-6 rounded-lg border border-black-100 bg-[color:var(--brand-primary-50)] p-4"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-2 text-sm font-bold mb-3">
        <CreditCard size={17} className="text-[color:var(--brand-primary-700)]" />
        Datos de la tarjeta
      </div>
      {/*
        Aviso en pantalla cuando los campos vienen precargados con
        datos de prueba. Es deliberado: una tarjeta de test
        precargada que parece real es la forma mas facil de que
        alguien pulse "pagar" creyendo que esta cobrando de verdad.
      */}
      {isDevWithTestCard() && testCardFitsMethod(method) && (
        <p className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-800">
          Datos de prueba de sandbox, no usar con clientes reales.
          {!isPaywayTestCardApproved(method) &&
            " Esta tarjeta es Visa: solo aprueba en Visa, porque Payway exige que el medio de pago coincida con la marca."}
        </p>
      )}
      <div className="space-y-3">
        <div>
          <Label>Titular de la tarjeta</Label>
          <Input
            className="mt-1 bg-card"
            autoComplete="cc-name"
            maxLength={60}
            value={titular}
            onChange={(e) => setTitular(e.target.value)}
            placeholder="Como aparece en la tarjeta"
            data-decidir="card_holder_name"
          />
        </div>
        <div>
          <Label>Numero de tarjeta</Label>
          <Input
            className="mt-1 bg-card font-mono tracking-wider"
            inputMode="numeric"
            autoComplete="cc-number"
            value={nro}
            onChange={(e) => setNro(formatNro(e.target.value, method))}
            placeholder={isAmex ? "0000 000000 00000" : "0000 0000 0000 0000"}
            data-decidir="card_number"
          />
        </div>
        {/*
          El SDK de Payway espera mes y anio por separado, no un
          "MM/AA" combinado. El input visible no lleva
          `data-decidir`: los valores que el SDK lee salen de los
          dos inputs ocultos de abajo, derivados del mismo estado.
        */}
        <input type="hidden" readOnly data-decidir="card_expiration_month" value={vencMes} />
        <input type="hidden" readOnly data-decidir="card_expiration_year" value={vencAnio} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Vencimiento</Label>
            <Input
              className="mt-1 bg-card font-mono"
              inputMode="numeric"
              autoComplete="cc-exp"
              maxLength={5}
              value={venc}
              onChange={(e) => setVenc(formatVenc(e.target.value))}
              placeholder="MM/AA"
              name="vencimiento"
            />
          </div>
          <div>
            <Label>CVV</Label>
            {/*
              El CVV se pide y se valida aca, pero NO lleva
              `data-decidir`: el SDK de Payway no lo usa para
              tokenizar (solo para re-pagar con una tarjeta ya
              tokenizada). Marcarlo mandaria el CVV dentro de un
              payload que la API puede rechazar.
            */}
            <Input
              className="mt-1 bg-card font-mono"
              inputMode="numeric"
              autoComplete="cc-csc"
              maxLength={maxCvv}
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, maxCvv))}
              placeholder={isAmex ? "1234" : "123"}
              name="cvv"
            />
          </div>
        </div>
        <div>
          <Label>Numero de documento del titular</Label>
          {/*
            La API de Payway exige `card_holder_identification`.
            El SDK la arma a partir de estos dos campos: si estan
            presentes produce el objeto, y si no, no lo manda. Por
            eso el tipo va fijo en hidden y solo el numero es
            editable.
          */}
          <input type="hidden" readOnly data-decidir="card_holder_doc_type" value="dni" />
          <Input
            className="mt-1 bg-card font-mono"
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            value={documento}
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="12345678"
            data-decidir="card_holder_doc_number"
          />
        </div>
      </div>
    </form>
  );
}
