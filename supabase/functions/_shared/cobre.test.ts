// Tests del cliente de Cobre y del simulador: `npx -y deno@2.9.5 test supabase/functions/_shared/`
//
// Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  _reiniciarCobre,
  aCentavos,
  baseUrlCobre,
  claveEvento,
  CobreCliente,
  CobreError,
  contraparteMx,
  contraparteUsd,
  estadoSubcliente,
  deCentavos,
  depositoSpei,
  firmarCobre,
  leerEventoCobre,
  modoCobre,
  msDeTimestamp,
  referenciaNumerica,
  resumirTransferencia,
  subclienteCobre,
  transaccionCobre,
  transferenciaSpei,
  verificacionUsd,
  verificarFirmaCobre,
  type DatosSubcliente,
} from "./cobre.ts";
import {
  AlmacenMemoria,
  avanzarSimulador,
  conDigitoClabe,
  decidirAprobacionSimulada,
  depositoSimulado,
  eventosPendientes,
  fetchSimulado,
  pagarR2pSimulado,
} from "./cobre-simulador.ts";

const cred = { userId: "cli_test", secret: "s3cr3t" };

Deno.test("modo y URL: sin COBRE_MODO es simulado; prueba exige COBRE_BASE_URL", () => {
  assertEquals(modoCobre(null), "simulado");
  assertEquals(modoCobre("produccion"), "produccion");
  assertEquals(modoCobre("cualquiera"), "simulado");
  assertEquals(baseUrlCobre("produccion", null), "https://api.cobre.co/v1");
  assertEquals(
    baseUrlCobre("prueba", "https://instancia.cobre.co/v1/"),
    "https://instancia.cobre.co/v1",
  );
  let error: unknown = null;
  try {
    baseUrlCobre("prueba", null);
  } catch (e) {
    error = e;
  }
  assertEquals(error instanceof CobreError, true);
});

Deno.test("montos en centavos", () => {
  assertEquals(aCentavos(2390.15), 239015);
  assertEquals(aCentavos(0.1 + 0.2), 30);
  assertEquals(deCentavos(12300), 123);
});

Deno.test("token: uno solo hasta el 95% de su vida, aunque se pida en paralelo", async () => {
  _reiniciarCobre();
  let auths = 0;
  let t = 0;
  const f: typeof fetch = async (url) => {
    if (String(url).endsWith("/auth")) {
      auths++;
      await new Promise((r) => setTimeout(r, 5));
      return new Response(JSON.stringify({ access_token: `tok${auths}`, expiration_time: 1200 }), {
        status: 201,
      });
    }
    return new Response("{}", { status: 200 });
  };
  const c = new CobreCliente({
    baseUrl: "https://x/v1",
    credenciales: cred,
    fetch: f,
    ahora: () => t,
  });
  const [a, b] = await Promise.all([c.token(), c.token()]);
  assertEquals([a, b, auths], ["tok1", "tok1", 1]);
  t = 1139_000; // 1139 s < 95% de 1200 s
  assertEquals(await c.token(), "tok1");
  t = 1141_000;
  assertEquals(await c.token(), "tok2");
});

Deno.test("401 renueva el token una vez y reintenta; 409 trae el código de Cobre", async () => {
  _reiniciarCobre();
  let llamadas = 0;
  const f: typeof fetch = (url, init) => {
    if (String(url).endsWith("/auth")) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: `t${llamadas}`, expiration_time: 1200 }), {
          status: 201,
        }),
      );
    }
    llamadas++;
    if (String(url).includes("/accounts")) {
      const auth = new Headers(init?.headers).get("authorization");
      return Promise.resolve(
        auth === "Bearer t0"
          ? new Response("", { status: 401 })
          : new Response('{"ok":1}', { status: 200 }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ code: "MM002", description: "Invalid destination" }), {
        status: 409,
      }),
    );
  };
  const c = new CobreCliente({ baseUrl: "https://x/v1", credenciales: cred, fetch: f });
  assertEquals(await c.get("/accounts"), { ok: 1 });
  const e = await assertRejects(() => c.post("/money_movements", {}, "clave-123456"), CobreError);
  assertEquals([e.status, e.codigo, e.message], [409, "MM002", "MM002: Invalid destination"]);
});

Deno.test("transferencias: estados y motivos en español", () => {
  const ok = resumirTransferencia({
    id: "mm_1",
    status: { state: "completed", code: "", description: "" },
    metadata: { tracking_key: "ABC", cep_url: "https://cep" },
    external_id: "jp_1",
    amount: 12300,
  });
  assertEquals(ok, {
    id: "mm_1",
    estado: "completada",
    estadoCobre: "completed",
    codigo: null,
    motivo: null,
    claveRastreo: "ABC",
    cep: "https://cep",
    externalId: "jp_1",
    monto: 123,
  });
  const r = resumirTransferencia({
    id: "mm_2",
    status: { state: "rejected", code: "R005", description: "x" },
  });
  assertEquals([r.estado, r.motivo], ["rechazada", "La cuenta de destino no existe"]);
  const raro = resumirTransferencia({
    status: { state: "failed", code: "F777", description: "Algo" },
  });
  assertEquals([raro.estado, raro.motivo], ["fallida", "Algo"]);
  assertEquals(
    resumirTransferencia({ status: { state: "pending_approval" } }).estado,
    "pendiente_aprobacion",
  );
  assertEquals(resumirTransferencia({ status: { state: "processing" } }).estado, "pendiente");
});

Deno.test("cuerpos de transferencia y contraparte", () => {
  assertEquals(
    transferenciaSpei({
      cuentaOrigen: "acc_1",
      contraparte: "cp_1",
      monto: 123.45,
      concepto: "Pago de factura con un concepto larguísimo que se corta",
      referencia: "1234567",
      externalId: "jp_9",
    }),
    {
      source_id: "acc_1",
      destination_id: "cp_1",
      amount: 12345,
      metadata: { description: "Pago de factura con un concepto larguísi", reference: "1234567" },
      external_id: "jp_9",
      checker_approval: false,
    },
  );
  assertEquals(/^\d{7}$/.test(referenciaNumerica("4c9a0e7e-uuid")), true);
  assertEquals(referenciaNumerica("abc"), referenciaNumerica("abc"));
  const cp = contraparteMx({
    tipo: "clabe",
    numero: "0021 8001 2345 6789 03",
    titular: "José Peña & Cía.",
    idTipo: "rfc",
    idNumero: "pecj800101aaa",
  });
  assertEquals(cp, {
    geo: "mex",
    type: "clabe",
    metadata: {
      account_number: "002180012345678903",
      counterparty_fullname: "JOSE PENA CIA",
      counterparty_id_type: "rfc",
      counterparty_id_number: "PECJ800101AAA",
    },
  });
  let e: unknown = null;
  try {
    contraparteMx({
      tipo: "spei_card",
      numero: "4242424242424242",
      titular: "A",
      idTipo: "curp",
      idNumero: "X",
    });
  } catch (x) {
    e = x;
  }
  assertEquals((e as Error).message, "Falta el banco de la tarjeta");
});

Deno.test("depósitos y eventos", () => {
  const ev = leerEventoCobre({
    id: "ev_1",
    event_key: "accounts.balance.credit",
    content: {
      id: "trx_1",
      type: "spei_credit",
      amount: 1000,
      date: "2025-11-11T19:04:27Z",
      account_id: "acc_1",
      metadata: {
        account_reference: "703013052111000038",
        sender_name: "Juan",
        sender_id: "N/A",
        tracking_key: "TK",
      },
    },
  });
  assertEquals([ev.id, ev.evento], ["ev_1", "accounts.balance.credit"]);
  const d = depositoSpei(ev.contenido);
  assertEquals(d?.monto, 10);
  assertEquals(d?.clabeDestino, "703013052111000038");
  assertEquals(d?.remitenteId, null);
  assertEquals(depositoSpei({ type: "spei_debit" }), null);
});

Deno.test("firma de webhooks: HMAC-SHA256 hex de timestamp.cuerpo", async () => {
  const cuerpo = '{"id":"ev_1","event_key":"x"}';
  const firma = await firmarCobre("clave", "2025-11-11T19:04:27Z", cuerpo);
  assertEquals(firma.length, 64);
  const ahora = Date.parse("2025-11-11T19:05:00Z");
  const v = (f: string | null, c = cuerpo) =>
    verificarFirmaCobre({
      clave: "clave",
      timestamp: "2025-11-11T19:04:27Z",
      firma: f,
      cuerpo: c,
      ahora,
    });
  assertEquals(await v(firma), true);
  // Un aviso firmado hace más de 15 minutos se rechaza (reenvío de un aviso viejo).
  assertEquals(
    await verificarFirmaCobre({
      clave: "clave",
      timestamp: "2025-11-11T19:04:27Z",
      firma,
      cuerpo,
      ahora: ahora + 20 * 60_000,
    }),
    false,
  );
  assertEquals(msDeTimestamp("1762887867"), 1762887867000);
  assertEquals(msDeTimestamp("1762887867000"), 1762887867000);
  assertEquals(msDeTimestamp("no"), null);
  assertEquals(await v(firma.toUpperCase()), true);
  assertEquals(await v(firma, cuerpo + " "), false);
  assertEquals(await v("00"), false);
  assertEquals(await v(null), false);
});

Deno.test("simulador: cuenta, CLABE virtual, depósito y transferencia completa", async () => {
  _reiniciarCobre();
  const almacen = new AlmacenMemoria();
  let t = 1_000_000;
  const c = new CobreCliente({
    baseUrl: "https://cobre.simulado/v1",
    credenciales: cred,
    fetch: fetchSimulado(almacen, { ahora: () => t }),
    ahora: () => t,
  });
  const cuenta = await c.post<{ id: string; account_number: string }>("/accounts", {
    provider_id: "pr_mex_cobre3",
    action: "create",
    alias: "JPay MX",
  });
  assertEquals(conDigitoClabe(cuenta.account_number.slice(0, 17)), cuenta.account_number);
  const ref = await c.post<{ value: string }>("/account_references", {
    source_id: cuenta.id,
    type: "virtual_clabe_accounts",
    alias: "Cliente 1",
  });
  const dep = await depositoSimulado(almacen, { clabe: ref.value, monto: 500 }, t);
  assertEquals(depositoSpei(dep)?.clabeDestino, ref.value);

  const cp = await c.post<{ id: string }>(
    "/counterparties",
    contraparteMx({
      tipo: "clabe",
      numero: conDigitoClabe("01218000123456789"),
      titular: "Ana",
      idTipo: "rfc",
      idNumero: "XAXX010101000",
    }),
  );
  const cuerpo = transferenciaSpei({
    cuentaOrigen: cuenta.id,
    contraparte: cp.id,
    monto: 200,
    concepto: "Pago",
    referencia: "1",
    externalId: "jp_1",
  });
  const mm = await c.post<{ id: string }>("/money_movements", cuerpo, "clave-idem-1");
  const otra = await c.post<{ id: string }>("/money_movements", cuerpo, "clave-idem-1");
  assertEquals(otra.id, mm.id);
  await assertRejects(() => c.post("/money_movements", cuerpo, "corta"), CobreError);

  t += 1500;
  assertEquals(
    resumirTransferencia(await c.get(`/money_movements/${mm.id}`)).estadoCobre,
    "processing",
  );
  t += 5000;
  const fin = resumirTransferencia(await c.get(`/money_movements/${mm.id}`));
  assertEquals([fin.estado, !!fin.claveRastreo, !!fin.cep], ["completada", true, true]);
  const saldo = await c.get<{ obtained_balance: number }>(`/accounts/${cuenta.id}`);
  assertEquals(saldo.obtained_balance, 30000);
  const eventos = (await eventosPendientes(almacen)).map(
    (e) => (e.cuerpo as { event_key: string }).event_key,
  );
  assertEquals(eventos, [
    "accounts.balance.credit",
    "money_movements.status.initiated",
    "accounts.balance.debit",
    "money_movements.status.processing",
    "money_movements.status.completed",
  ]);
});

Deno.test("simulador: sin fondos, rechazo con reintegro y aprobación", async () => {
  _reiniciarCobre();
  const almacen = new AlmacenMemoria();
  let t = 0;
  const c = new CobreCliente({
    baseUrl: "https://cobre.simulado/v1",
    credenciales: cred,
    fetch: fetchSimulado(almacen, { ahora: () => t }),
    ahora: () => t,
  });
  const cuenta = await c.post<{ id: string; account_number: string }>("/accounts", {
    provider_id: "pr_mex_cobre3",
    action: "create",
  });
  const nuevaCp = (titular: string) =>
    c.post<{ id: string }>(
      "/counterparties",
      contraparteMx({
        tipo: "clabe",
        numero: conDigitoClabe("01218000123456789"),
        titular,
        idTipo: "rfc",
        idNumero: "X",
      }),
    );
  const mover = (cp: string, monto: number, clave: string, aprobacion = false) =>
    c.post<{ id: string }>(
      "/money_movements",
      transferenciaSpei({
        cuentaOrigen: cuenta.id,
        contraparte: cp,
        monto,
        concepto: "x",
        referencia: "2",
        externalId: clave,
        aprobacion,
      }),
      clave,
    );

  const sinFondos = await mover((await nuevaCp("Ana")).id, 50, "sin-fondos-1");
  t += 2000;
  const f = resumirTransferencia(await c.get(`/money_movements/${sinFondos.id}`));
  assertEquals(
    [f.estado, f.codigo, f.motivo],
    ["fallida", "F002", "Fondos insuficientes en la cuenta de origen"],
  );

  await depositoSimulado(almacen, { clabe: cuenta.account_number, monto: 100 }, t);
  const rechazo = await mover((await nuevaCp("Prueba Rechazo")).id, 80, "rechazo-0001");
  t += 1500;
  await avanzarSimulador(almacen, t);
  t += 5000;
  const r = resumirTransferencia(await c.get(`/money_movements/${rechazo.id}`));
  assertEquals([r.estado, r.codigo], ["rechazada", "R005"]);
  assertEquals(
    (await c.get<{ obtained_balance: number }>(`/accounts/${cuenta.id}`)).obtained_balance,
    10000,
  );

  const aprob = await mover((await nuevaCp("Ana")).id, 10, "aprobacion-1", true);
  t += 10_000;
  assertEquals(
    resumirTransferencia(await c.get(`/money_movements/${aprob.id}`)).estado,
    "pendiente_aprobacion",
  );
  await decidirAprobacionSimulada(almacen, aprob.id, false, t);
  assertEquals(
    resumirTransferencia(await c.get(`/money_movements/${aprob.id}`)).estado,
    "cancelada",
  );
});

Deno.test("simulador: verificación de cuenta y CLABE inválida", async () => {
  _reiniciarCobre();
  const almacen = new AlmacenMemoria();
  let t = 0;
  const c = new CobreCliente({
    baseUrl: "https://cobre.simulado/v1",
    credenciales: cred,
    fetch: fetchSimulado(almacen, { ahora: () => t }),
    ahora: () => t,
  });
  const av = await c.post<{ id: string; status: { state: string } }>("/account_verifications", {
    model: "mex_acc_ownership_1",
    verification_request: {
      account_number: conDigitoClabe("01218000123450000"),
      account_type: "clabe",
      account_holder_id_type: "rfc",
      account_holder_id_number: "XAXX010101000",
    },
    external_id: "av-test-001",
  });
  assertEquals(av.status.state, "processing");
  t += 6000;
  const fin = await c.get<{
    status: { state: string };
    verification_response: { verification_result: string };
  }>(`/account_verifications/${av.id}`);
  assertEquals(fin.status.state, "completed");
  assertEquals(fin.verification_response.verification_result, "unmatched");
  const e = await assertRejects(
    () =>
      c.post("/counterparties", {
        geo: "mex",
        type: "clabe",
        metadata: { account_number: "123", counterparty_id_type: "rfc" },
      }),
    CobreError,
  );
  assertEquals(e.codigo, "CP003");
});

Deno.test("simulador: devolución de un depósito", async () => {
  _reiniciarCobre();
  const almacen = new AlmacenMemoria();
  let t = 0;
  const c = new CobreCliente({
    baseUrl: "https://cobre.simulado/v1",
    credenciales: cred,
    fetch: fetchSimulado(almacen, { ahora: () => t }),
    ahora: () => t,
  });
  const cuenta = await c.post<{ id: string; account_number: string }>("/accounts", {
    provider_id: "pr_mex_cobre3",
    action: "create",
  });
  const dep = await depositoSimulado(almacen, { clabe: cuenta.account_number, monto: 50 }, t);
  const mm = await c.post<{ id: string; type: string; external_id: string }>(
    "/money_movements_return",
    {
      transaction_id: dep.id,
      metadata: { description: "Depósito sin dueño" },
    },
  );
  assertEquals([mm.type, mm.external_id], ["spei_return", dep.id]);
  await assertRejects(
    () =>
      c.post("/money_movements_return", { transaction_id: dep.id, metadata: { description: "x" } }),
    CobreError,
  );
  t += 1500;
  await avanzarSimulador(almacen, t);
  t += 5000;
  assertEquals(resumirTransferencia(await c.get(`/money_movements/${mm.id}`)).estado, "completada");
  assertEquals(
    (await c.get<{ obtained_balance: number }>(`/accounts/${cuenta.id}`)).obtained_balance,
    0,
  );
});

// ── Solution Design de JPAY (2026-10-26) ─────────────────────────────────────

Deno.test("eventos: familia y estado del event_key; transacciones de cualquier tipo", () => {
  assertEquals(claveEvento("money_movements.status.completed"), {
    familia: "money_movements",
    estado: "completed",
  });
  assertEquals(claveEvento("subclient.status.approved"), {
    familia: "subclient",
    estado: "approved",
  });
  assertEquals(
    claveEvento("cross_border_money_movements.status.rejected").familia,
    "cross_border_money_movements",
  );
  assertEquals(
    claveEvento("bulk_money_movements.status.validating").familia,
    "bulk_money_movements",
  );
  assertEquals(claveEvento("accounts.balance.debit"), {
    familia: "accounts.balance",
    estado: "debit",
  });
  assertEquals(claveEvento("otra.cosa").familia, null);
  const t = transaccionCobre({
    id: "trx_1",
    type: "cbmm_debit",
    amount: -200000,
    currency: "mxn",
    date: "2025-11-11T19:04:27Z",
    metadata: { money_movement_id: "mm_1", mm_external_id: "FX1" },
    account_id: "acc_1",
  });
  assertEquals(
    [t.tipo, t.monto, t.mmId, t.mmExternalId, t.cuentaId],
    ["cbmm_debit", -2000, "mm_1", "FX1", "acc_1"],
  );
});

const datosKyb = (): DatosSubcliente => ({
  razonSocial: "Test Co. S.A. de C.V.",
  nombreCorto: "Test Có con un nombre muy largo para SPEI",
  rfc: "mer900191abc",
  correo: "contacto@testco.mx",
  telefono: "+52 55 1234 5678",
  sitioWeb: "www.test.co",
  industria: "domestic_psp",
  fechaConstitucion: "2015-03-20",
  paisConstitucion: "mex",
  paisOperacion: "MEX",
  domicilio: {
    calle: "Av. Insurgentes Sur 1234",
    ciudad: "Ciudad de Mexico",
    estado: "CDMX",
    cp: "03100",
    pais: "MEX",
  },
  representantes: [
    {
      nombre: "Lila",
      apellido: "Rosa",
      idTipo: "rfc",
      idNumero: "PEL800101ABD",
      nacionalidades: ["MEX"],
      fechaNacimiento: "1985-11-28",
    },
  ],
  ubos: [
    {
      nombre: "Juan",
      apellido: "Pérez",
      idTipo: "rfc",
      idNumero: "PEPJ750808ABC",
      nacionalidades: ["MEX"],
      fechaNacimiento: "1975-08-08",
    },
  ],
});

Deno.test("subcliente: cuerpo del alta, nombre corto acotado y lo que falta", () => {
  const { cuerpo, faltan } = subclienteCobre(datosKyb());
  assertEquals(faltan, []);
  assertEquals(cuerpo.id_number, "MER900191ABC");
  assertEquals(cuerpo.phone, "+525512345678");
  assertEquals(cuerpo.website, "https://www.test.co");
  assertEquals(cuerpo.country_of_incorporation, "MEX");
  assertEquals((cuerpo.short_name as string).length <= 30, true);
  assertEquals((cuerpo.ubos as { last_name: string }[])[0].last_name, "Perez");
  const incompleto = subclienteCobre({
    ...datosKyb(),
    telefono: "5512345678",
    sitioWeb: "",
    ubos: [],
  });
  assertEquals(incompleto.faltan.includes("Sitio web"), true);
  assertEquals(incompleto.faltan.includes("Al menos un beneficiario final"), true);
  assertEquals(
    incompleto.faltan.some((f) => f.startsWith("Teléfono")),
    true,
  );
  // La API usa status.state; el aviso, status como cadena.
  assertEquals(
    estadoSubcliente({ id: "sc_1", status: { state: "processing" } }).estado,
    "processing",
  );
  assertEquals(estadoSubcliente({ id: "sc_1", status: "approved" }).estado, "approved");
  assertEquals(estadoSubcliente({ id: "sc_1", status: "otro" }).estado, null);
});

Deno.test("beneficiarios USD: Fedwire con ABA, SWIFT con BIC", () => {
  const base = {
    titular: "Empresa ABC",
    idTipo: "ein",
    idNumero: "9000123",
    correo: "a@abc.com",
    telefono: "+12125551234",
    paisConstitucion: "USA",
    direccion: {
      calle1: "123 Main Ave",
      ciudad: "New York",
      estado: "NY",
      cp: "10001",
      pais: "USA",
    },
  };
  const fed = contraparteUsd({
    ...base,
    rail: "fedwire",
    banco: {
      nombre: "Bank of America",
      cuenta: "1234567890",
      tipoCuenta: "checking",
      aba: "026009593",
      direccion: { pais: "USA" },
    },
  });
  assertEquals(fed.geo, "usa");
  const bank = (fed.metadata as Record<string, Record<string, unknown>>).counterparty_bank_details;
  assertEquals([bank.rail, bank.routing_number, bank.bic], ["fedwire", "026009593", undefined]);
  const sw = contraparteUsd({
    ...base,
    rail: "swift",
    direccion: { ...base.direccion, pais: "COL" },
    banco: {
      nombre: "Portage Bank",
      cuenta: "477465322223",
      bic: "porgus62xxx",
      direccion: { pais: "USA" },
    },
  });
  assertEquals(sw.geo, "col");
  const b2 = (sw.metadata as Record<string, Record<string, unknown>>).counterparty_bank_details;
  assertEquals([b2.rail, b2.routing_number, b2.bic], ["swift", "", "PORGUS62XXX"]);
  let e = null;
  try {
    contraparteUsd({
      ...base,
      rail: "fedwire",
      banco: { nombre: "X", cuenta: "123456", aba: "12", direccion: { pais: "USA" } },
    });
  } catch (x) {
    e = x;
  }
  assertEquals(e instanceof CobreError, true);
  assertEquals(
    verificacionUsd({ metadata: { counterparty_verification_status: "Verified" } }),
    "verified",
  );
  assertEquals(verificacionUsd({ metadata: {} }), "procesando");
});

const clienteSim = (almacen: AlmacenMemoria, reloj: { t: number }) => {
  _reiniciarCobre();
  return new CobreCliente({
    baseUrl: "https://cobre.simulado/v1",
    credenciales: cred,
    fetch: fetchSimulado(almacen, { ahora: () => reloj.t }),
    ahora: () => reloj.t,
  });
};

Deno.test(
  "simulador: Subcliente aprobado y su Balance México; rechazado no abre Balance",
  async () => {
    const almacen = new AlmacenMemoria();
    const reloj = { t: 1_000_000 };
    const c = clienteSim(almacen, reloj);
    const { cuerpo } = subclienteCobre(datosKyb());
    await assertRejects(
      () => c.post("/subclients", cuerpo, undefined, { "Idempotency-Key": "corta" }),
      CobreError,
    );
    const sc = await c.post<{ id: string; status: { state: string } }>(
      "/subclients",
      cuerpo,
      undefined,
      {
        "Idempotency-Key": "SC-test-0001",
      },
    );
    assertEquals(sc.status.state, "processing");
    // Misma clave → mismo Subcliente.
    const otra = await c.post<{ id: string }>("/subclients", cuerpo, undefined, {
      "Idempotency-Key": "SC-test-0001",
    });
    assertEquals(otra.id, sc.id);
    const antes = await assertRejects(
      () =>
        c.post("/accounts", {
          provider_id: "pr_mex_cobre3",
          action: "create",
          subclient_id: sc.id,
        }),
      CobreError,
    );
    assertEquals(antes.codigo, "ACC011");
    reloj.t += 6000;
    assertEquals(
      (await c.get<{ status: { state: string } }>(`/subclients/${sc.id}`)).status.state,
      "approved",
    );
    const acc = await c.post<{ id: string; account_number: string; currency: string }>(
      "/accounts",
      {
        provider_id: "pr_mex_cobre3",
        action: "create",
        subclient_id: sc.id,
        alias: "JPAY TestCo",
      },
    );
    assertEquals([acc.account_number.length, acc.currency], [18, "mxn"]);
    const aviso = (await eventosPendientes(almacen)).find(
      (e) => (e.cuerpo as Record<string, unknown>).event_key === "subclient.status.approved",
    );
    assertEquals(
      (aviso?.cuerpo as Record<string, Record<string, unknown>>).content.status,
      "approved",
    );

    const rech = await c.post<{ id: string }>(
      "/subclients",
      { ...cuerpo, legal_name: "RECHAZO SA" },
      undefined,
      {
        "Idempotency-Key": "SC-test-0002",
      },
    );
    reloj.t += 6000;
    assertEquals(
      (await c.get<{ status: { state: string } }>(`/subclients/${rech.id}`)).status.state,
      "rejected",
    );
  },
);

Deno.test(
  "simulador: R2P pagado acredita con mm_external_id; sin pagar vence con F003",
  async () => {
    const almacen = new AlmacenMemoria();
    const reloj = { t: 2_000_000 };
    const c = clienteSim(almacen, reloj);
    const acc = await c.post<{ id: string }>("/accounts", {
      provider_id: "pr_mex_cobre3",
      action: "create",
    });
    const cp = await c.post<{ id: string }>("/counterparties", {
      geo: "mex",
      type: "r2p_spei",
      alias: "Jaime Roa",
      metadata: {
        counterparty_fullname: "JAIME ROA",
        counterparty_id_type: "rfc",
        counterparty_id_number: "REMJ0000011C8",
      },
    });
    const crear = (ext: string) =>
      c.post<{ id: string; type: string; metadata: { virtual_account: string } }>(
        "/money_movements",
        {
          amount: 12300,
          source_id: cp.id,
          destination_id: acc.id,
          metadata: {
            r2p_rail: "spei",
            description_to_payer: "PayIn",
            description_to_payee: "PayIn",
            valid_until: new Date(reloj.t + 60_000).toISOString(),
          },
          external_id: ext,
        },
        ext,
      );
    const mm = await crear("R2P-0000001");
    assertEquals(mm.type, "r2p_spei");
    assertEquals(mm.metadata.virtual_account.length, 18);
    const trx = await pagarR2pSimulado(almacen, mm.metadata.virtual_account, reloj.t);
    const t = transaccionCobre(trx);
    assertEquals(
      [t.tipo, t.monto, t.mmExternalId, t.mmId],
      ["r2p_spei_credit", 123, "R2P-0000001", mm.id],
    );
    assertEquals(
      resumirTransferencia(await c.get(`/money_movements/${mm.id}`)).estado,
      "completada",
    );

    const vence = await crear("R2P-0000002");
    reloj.t += 61_000;
    const r = resumirTransferencia(await c.get(`/money_movements/${vence.id}`));
    assertEquals([r.estado, r.codigo], ["rechazada", "F003"]);
    await assertRejects(() => pagarR2pSimulado(almacen, vence.metadata.virtual_account, reloj.t));
  },
);

Deno.test("simulador: rebote posterior a completed llega como spei_rejected", async () => {
  const almacen = new AlmacenMemoria();
  const reloj = { t: 3_000_000 };
  const c = clienteSim(almacen, reloj);
  const acc = await c.post<{ id: string; account_number: string }>("/accounts", {
    provider_id: "pr_mex_cobre3",
    action: "create",
  });
  await depositoSimulado(almacen, { clabe: acc.account_number, monto: 100 }, reloj.t);
  const cp = await c.post<{ id: string }>(
    "/counterparties",
    contraparteMx({
      tipo: "clabe",
      numero: conDigitoClabe("01218000123450001"),
      titular: "Rebote SA",
      idTipo: "rfc",
      idNumero: "XAXX010101000",
    }),
  );
  const mm = await c.post<{ id: string }>(
    "/money_movements",
    transferenciaSpei({
      cuentaOrigen: acc.id,
      contraparte: cp.id,
      monto: 10,
      concepto: "x",
      referencia: "1",
      externalId: "TXREBOTE01",
    }),
    "TXREBOTE01",
  );
  reloj.t += 1500;
  await avanzarSimulador(almacen, reloj.t);
  reloj.t += 4500;
  await avanzarSimulador(almacen, reloj.t);
  assertEquals(resumirTransferencia(await c.get(`/money_movements/${mm.id}`)).estado, "completada");
  reloj.t += 3500;
  await avanzarSimulador(almacen, reloj.t);
  const txs = await c.get<{ contents: Record<string, unknown>[] }>(
    `/accounts/${acc.id}/transactions`,
  );
  const rebote = txs.contents.map(transaccionCobre).find((x) => x.tipo === "spei_rejected");
  assertEquals([rebote?.monto, rebote?.mmId], [10, mm.id]);
  assertEquals(resumirTransferencia(await c.get(`/money_movements/${mm.id}`)).estado, "completada");
});

Deno.test("simulador: lote SPEI crea un movimiento por ítem con batch_id", async () => {
  const almacen = new AlmacenMemoria();
  const reloj = { t: 4_000_000 };
  const c = clienteSim(almacen, reloj);
  const acc = await c.post<{ id: string; account_number: string }>("/accounts", {
    provider_id: "pr_mex_cobre3",
    action: "create",
  });
  await depositoSimulado(almacen, { clabe: acc.account_number, monto: 1000 }, reloj.t);
  const cp = await c.post<{ id: string }>(
    "/counterparties",
    contraparteMx({
      tipo: "clabe",
      numero: conDigitoClabe("01218000123450002"),
      titular: "Uno",
      idTipo: "rfc",
      idNumero: "XAXX010101000",
    }),
  );
  const items = [1, 2].map((n) => ({
    amount: n * 100,
    source_id: acc.id,
    destination_id: cp.id,
    metadata: { description: "Pago", reference: String(n) },
    external_id: `LOTE00001-${n}`,
  }));
  const fd = new FormData();
  fd.append(
    "file",
    new File([JSON.stringify(items)], "jpay-lote-1.json", { type: "application/json" }),
  );
  const bat = await c.post<{ id: string; input_filename: string; status: { state: string } }>(
    "/bulk_money_movements",
    fd,
  );
  assertEquals([bat.status.state, bat.input_filename], ["validating", "jpay-lote-1.json"]);
  reloj.t += 1500;
  await avanzarSimulador(almacen, reloj.t);
  assertEquals(
    (await c.get<{ status: { state: string } }>(`/bulk_money_movements/${bat.id}`)).status.state,
    "completed",
  );
  const mms = await c.get<{ contents: { external_id: string; batch_id: string }[] }>(
    "/money_movements",
    { batch_id: bat.id },
  );
  assertEquals(mms.contents.map((m) => m.external_id).sort(), ["LOTE00001-1", "LOTE00001-2"]);
});

Deno.test(
  "simulador: cotización, Cross Border, traslado Global→USA, Fedwire y SWIFT fallido",
  async () => {
    const almacen = new AlmacenMemoria();
    const reloj = { t: Date.parse("2026-10-28T15:00:00Z") };
    const c = clienteSim(almacen, reloj);
    const mx = await c.post<{ id: string; account_number: string }>("/accounts", {
      provider_id: "pr_mex_cobre3",
      action: "create",
    });
    const global = await c.post<{ id: string; currency: string }>("/accounts", {
      provider_id: "pr_global_cobre",
      action: "create",
      metadata: { currency: "usd" },
    });
    const usa = await c.post<{ id: string }>("/accounts", {
      provider_id: "pr_usa_cobre",
      action: "create",
      metadata: {},
    });
    assertEquals(global.currency, "usd");
    await depositoSimulado(almacen, { clabe: mx.account_number, monto: 2000 }, reloj.t);

    const q = await c.post<{
      id: string;
      destination_amount: number;
      valid_until: string;
      off_market: boolean;
    }>("/fx_quotes", {
      currency_pair: "mxn/usd",
      source_amount: 200000,
      type: "static_quote",
    });
    assertEquals([q.destination_amount, q.off_market], [10800, false]);
    // Cotización vencida: el movimiento se rechaza (se pide otra; nunca se reintenta).
    reloj.t += 26_000;
    const vencida = await assertRejects(
      () =>
        c.post(
          "/cross_border_money_movements",
          {
            source_id: mx.id,
            destination_id: global.id,
            forex_quote_id: q.id,
            external_id: "FX-000001",
          },
          "FX-000001",
        ),
      CobreError,
    );
    assertEquals(vencida.codigo, "CBMM003");
    const q2 = await c.post<{ id: string }>("/fx_quotes", {
      currency_pair: "mxn/usd",
      source_amount: 200000,
      type: "static_quote",
    });
    const cb = await c.post<{ id: string; type: string }>(
      "/cross_border_money_movements",
      {
        source_id: mx.id,
        destination_id: global.id,
        forex_quote_id: q2.id,
        metadata: { destination_description: "x" },
        external_id: "FX-000002",
      },
      "FX-000002",
    );
    assertEquals(cb.type, "cross_border");
    reloj.t += 1500;
    await avanzarSimulador(almacen, reloj.t);
    reloj.t += 3500;
    await avanzarSimulador(almacen, reloj.t);
    assertEquals(
      (await c.get<{ status: { state: string } }>(`/cross_border_money_movements/${cb.id}`)).status
        .state,
      "completed",
    );
    assertEquals(
      (await c.get<{ obtained_balance: number }>(`/accounts/${global.id}`)).obtained_balance,
      10800,
    );

    const traslado = await c.post<{ id: string }>(
      "/money_movements",
      {
        source_id: global.id,
        destination_id: usa.id,
        amount: 5000,
        metadata: { description: "Traslado" },
        external_id: "TX-USD-01-T",
      },
      "TX-USD-01-T",
    );
    reloj.t += 2500;
    await avanzarSimulador(almacen, reloj.t);
    const tr = await c.get<{ type: string; status: { state: string } }>(
      `/money_movements/${traslado.id}`,
    );
    assertEquals([tr.type, tr.status.state], ["global_pay_to_usa", "completed"]);

    const benef = (rail: "fedwire" | "swift", nombre: string) =>
      contraparteUsd({
        rail,
        titular: nombre,
        idTipo: "ein",
        idNumero: "9000123",
        correo: "a@b.com",
        telefono: "+12125551234",
        paisConstitucion: "USA",
        direccion: { calle1: "1 Main", ciudad: "NY", estado: "NY", cp: "10001", pais: "USA" },
        banco:
          rail === "fedwire"
            ? { nombre: "BoA", cuenta: "1234567890", aba: "026009593", direccion: { pais: "USA" } }
            : {
                nombre: "Portage",
                cuenta: "477465322223",
                bic: "PORGUS62XXX",
                direccion: { pais: "USA" },
              },
      });
    const fed = await c.post<{ id: string }>("/counterparties", benef("fedwire", "Empresa ABC"));
    const sw = await c.post<{ id: string }>("/counterparties", benef("swift", "FALLA SA"));
    const sinVerificar = await assertRejects(
      () =>
        c.post(
          "/money_movements",
          {
            source_id: usa.id,
            destination_id: fed.id,
            amount: 1000,
            metadata: { description: "x" },
            external_id: "TX-USD-00",
          },
          "TX-USD-00",
        ),
      CobreError,
    );
    assertEquals(sinVerificar.codigo, "MM041");
    reloj.t += 6000;
    await avanzarSimulador(almacen, reloj.t);
    const pago = (cp: string, ext: string, amount: number) =>
      c.post<{ id: string; type: string }>(
        "/money_movements",
        {
          source_id: usa.id,
          destination_id: cp,
          amount,
          metadata: { description: "Pago", category: "" },
          external_id: ext,
        },
        ext,
      );
    const p1 = await pago(fed.id, "TX-USD-01", 3000);
    const p2 = await pago(sw.id, "TX-USD-02", 1000);
    assertEquals([p1.type, p2.type], ["fedwire", "swift"]);
    reloj.t += 1500;
    await avanzarSimulador(almacen, reloj.t);
    reloj.t += 4500;
    await avanzarSimulador(almacen, reloj.t);
    assertEquals(
      resumirTransferencia(await c.get(`/money_movements/${p1.id}`)).estado,
      "completada",
    );
    assertEquals(resumirTransferencia(await c.get(`/money_movements/${p2.id}`)).estado, "fallida");
    // El SWIFT fallido devuelve el USD al Balance USA: 50 − 30 = 20 USD.
    assertEquals(
      (await c.get<{ obtained_balance: number }>(`/accounts/${usa.id}`)).obtained_balance,
      2000,
    );
  },
);
