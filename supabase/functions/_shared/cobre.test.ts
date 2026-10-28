// Tests del cliente de Cobre y del simulador: `npx -y deno@2.9.5 test supabase/functions/_shared/`
//
// Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  _reiniciarCobre,
  aCentavos,
  baseUrlCobre,
  CobreCliente,
  CobreError,
  contraparteMx,
  deCentavos,
  depositoSpei,
  firmarCobre,
  leerEventoCobre,
  modoCobre,
  referenciaNumerica,
  resumirTransferencia,
  transferenciaSpei,
  verificarFirmaCobre,
} from "./cobre.ts";
import {
  AlmacenMemoria,
  avanzarSimulador,
  conDigitoClabe,
  decidirAprobacionSimulada,
  depositoSimulado,
  eventosPendientes,
  fetchSimulado,
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
  const v = (f: string | null, c = cuerpo) =>
    verificarFirmaCobre({ clave: "clave", timestamp: "2025-11-11T19:04:27Z", firma: f, cuerpo: c });
  assertEquals(await v(firma), true);
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
  const av = await c.post<{ id: string; status: string }>("/account_verifications", {
    model: "mex_acc_ownership_1",
    account_number: conDigitoClabe("01218000123450000"),
  });
  assertEquals(av.status, "processing");
  t += 6000;
  const fin = await c.get<{ verification_response: string }>(`/account_verifications/${av.id}`);
  assertEquals(fin.verification_response, "unmatched");
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
