import { assertEquals } from "jsr:@std/assert@1";
import {
  clabeValida,
  domiciliacionAEcart,
  eventoRecurrente,
  idRecurrente,
  resumenAvisoRecurrente,
  suscripcionAEcart,
  suscripcionDeEcart,
  validarDomiciliacion,
  validarSuscripcion,
  type NuevaDomiciliacion,
  type NuevaSuscripcion,
} from "./recurrentes.ts";

const sus = (o: Partial<NuevaSuscripcion> = {}): NuevaSuscripcion => ({
  idempotencyKey: "clave-de-prueba-123456",
  nombre: "Ana López",
  email: "ana@ejemplo.mx",
  servicio: "Plan mensual",
  beneficios: ["Soporte", " ", "Envíos"],
  monto: 299,
  moneda: "MXN",
  intervalo: "monthly",
  frecuencia: 1,
  diasPrueba: 7,
  cicloDia: 15,
  cicloMes: null,
  fechaFin: null,
  compromisoPeriodos: null,
  creadoPor: null,
  ...o,
});

const dom = (o: Partial<NuevaDomiciliacion> = {}): NuevaDomiciliacion => ({
  idempotencyKey: "clave-de-prueba-123456",
  nombre: "Ana López",
  email: "ana@ejemplo.mx",
  rfc: "XAXX010101000",
  clabe: "012180012345678909",
  alias: "",
  concepto: "Limpieza mensual",
  monto: 500,
  recurrente: true,
  intervalo: "monthly",
  cicloDia: null,
  fechaFin: null,
  creadoPor: null,
  ...o,
});

Deno.test("suscripción: validación", () => {
  assertEquals(validarSuscripcion(sus()), null);
  assertEquals(
    validarSuscripcion(sus({ email: "no-es-correo" })),
    "Correo del suscriptor inválido",
  );
  assertEquals(validarSuscripcion(sus({ monto: 19.999 })), "Monto inválido");
  assertEquals(validarSuscripcion(sus({ monto: 19.99 })), null);
  assertEquals(validarSuscripcion(sus({ intervalo: "biweekly" })), "Frecuencia inválida");
  assertEquals(
    validarSuscripcion(sus({ intervalo: "daily", cicloDia: 3 })),
    "El día de cobro no aplica a suscripciones diarias",
  );
  assertEquals(
    validarSuscripcion(sus({ intervalo: "weekly", cicloDia: 8 })),
    "Día de la semana: 1 (lunes) a 7",
  );
  assertEquals(
    validarSuscripcion(sus({ fechaFin: "2000-01-01" })),
    "La fecha de fin tiene que ser futura",
  );
});

Deno.test("suscripción: cuerpo para Ecart Pay (merchant management, sin beneficios vacíos)", () => {
  const b = suscripcionAEcart("cus_1", sus());
  assertEquals(b.customer_id, "cus_1");
  assertEquals(b.merchant_management, true);
  assertEquals(b.mixed_management, true);
  assertEquals(b.benefits, ["Soporte", "Envíos"]);
  assertEquals(b.trial_period_days, 7);
  assertEquals(b.billing_cycle, { day: 15, month: 1 });
  assertEquals("end_date" in b, false);
});

Deno.test("suscripción: estado y link desde la respuesta de Ecart Pay", () => {
  const r = suscripcionDeEcart({
    id: "sub_1",
    status: "paused",
    attempts: 5,
    errors: ["primero", "último error"],
    checkout_link: "https://sandbox.ecartpay.com/subscriptions/sub_1",
  });
  assertEquals(r.estado, "pausada");
  assertEquals(r.id_externo, "sub_1");
  assertEquals(r.intentos, 5);
  assertEquals(r.ultimo_error, "último error");
  assertEquals(r.checkout_link, "https://sandbox.ecartpay.com/subscriptions/sub_1");
  assertEquals("estado" in suscripcionDeEcart({ id: "x", status: "rara" }), false);
});

Deno.test("domiciliación: CLABE y validación", () => {
  assertEquals(clabeValida("012180012345678909"), true);
  assertEquals(clabeValida("012180012345678900"), false);
  assertEquals(clabeValida("0121800123"), false);
  assertEquals(validarDomiciliacion(dom()), null);
  assertEquals(
    validarDomiciliacion(dom({ clabe: "012180012345678900" })),
    "CLABE inválida (18 dígitos con dígito verificador)",
  );
  assertEquals(validarDomiciliacion(dom({ rfc: "ABC" })), "RFC inválido");
  assertEquals(validarDomiciliacion(dom({ intervalo: null })), "Frecuencia inválida");
  assertEquals(validarDomiciliacion(dom({ recurrente: false, intervalo: null })), null);
});

Deno.test("domiciliación: cuerpo para Ecart Pay", () => {
  const b = domiciliacionAEcart("cus_1", dom({ recurrente: false, intervalo: null }));
  assertEquals(b.is_recurring, false);
  assertEquals("interval" in b, false);
  assertEquals(b.currency, "MXN");
  assertEquals(b.billing_account, {
    clabe: "012180012345678909",
    alias: "Cuenta principal",
    customer_rfc: "XAXX010101000",
  });
});

Deno.test("avisos: tipo, id y resumen", () => {
  // Por notify_url la suscripción llega sin `event`.
  const sub = {
    id: "sub_9",
    service: "Plan",
    interval: "monthly",
    customer_id: "cus_1",
    updated_at: "2026-11-03T10:00:00.000Z",
    message: "The subscription payment was processed successfully.",
  };
  assertEquals(eventoRecurrente(null, sub), "subscription.notify");
  assertEquals(idRecurrente(sub), "sub_9");
  assertEquals(resumenAvisoRecurrente(sub).updated_at, "2026-11-03T10:00:00.000Z");

  const dd = {
    event: "direct_debit.payment_success",
    data: { direct_debit_id: "dd_7", order_id: "ord_3", status: "active" },
  };
  assertEquals(
    eventoRecurrente("direct_debit.payment_success", dd),
    "direct_debit.payment_success",
  );
  assertEquals(idRecurrente(dd), "dd_7");
  assertEquals(resumenAvisoRecurrente(dd).order_id, "ord_3");
  // Una orden común no es un aviso recurrente.
  assertEquals(eventoRecurrente("orders.update", { id: "ord_1" }), null);
});
