// Tests del cliente de Ecart Pay (Deno): `npx -y deno@2.9.5 test supabase/functions/_shared/`.
// Archivo compartido: idéntico en los repos del panel admin y del portal empresas.
import { createHmac } from "node:crypto";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  _reiniciarEstado,
  canjearCodigoOAuth,
  centavosAUnidades,
  EcartPayCliente,
  EcartPayError,
  leerEventoWebhook,
  leerReferenciaPago,
  resumirOrden,
  unidadesACentavos,
  urlAutorizacionOAuth,
  vencimientoToken,
  verificarFirmaWebhook,
} from "./ecartpay.ts";

const BASE = "https://sandbox.ecartpay.com";
const CRED = { publicKey: "pub_test", privateKey: "priv_test" };

function jwt(expSeg: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b64({ alg: "HS512" })}.${b64({ exp: expSeg })}.firma`;
}

type Llamada = { url: string; auth: string | null; metodo: string };

/** fetch falso: `respuestas` se consume en orden (las del token se resuelven aparte). */
function fetchFalso(respuestas: Array<{ status: number; body?: unknown }>, tokens: string[]) {
  const llamadas: Llamada[] = [];
  const f = (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("authorization");
    llamadas.push({ url, auth, metodo: init?.method ?? "GET" });
    if (url.endsWith("/api/authorizations/token")) {
      const t = tokens.shift() ?? "sin-token";
      return Promise.resolve(Response.json({ token: t }));
    }
    const r = respuestas.shift() ?? { status: 500 };
    return Promise.resolve(
      r.body === undefined ? new Response(null, { status: r.status }) : Response.json(r.body, r),
    );
  };
  return { f: f as typeof fetch, llamadas };
}

const nuevo = (f: typeof fetch) =>
  new EcartPayCliente({ baseUrl: BASE, credenciales: CRED, fetch: f, reintentos: 1 });

Deno.test("montos: centavos ↔ unidades", () => {
  assertEquals(centavosAUnidades(12345), 123.45);
  assertEquals(unidadesACentavos(123.45), 12345);
  assertEquals(unidadesACentavos(0.1 + 0.2), 30);
});

Deno.test("vencimientoToken lee exp del JWT y si no, usa una hora", () => {
  assertEquals(vencimientoToken(jwt(2_000_000_000)), 2_000_000_000_000);
  assertEquals(vencimientoToken("opaco", 1000), 1000 + 3_600_000);
});

Deno.test("pide el token con Basic y lo reutiliza", async () => {
  _reiniciarEstado();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const { f, llamadas } = fetchFalso(
    [
      { status: 200, body: { docs: [] } },
      { status: 200, body: { docs: [] } },
    ],
    [jwt(exp)],
  );
  const c = nuevo(f);
  await c.get("/api/transactions");
  await c.get("/api/transactions", { limit: 1 });
  const token = llamadas.filter((l) => l.url.endsWith("/token"));
  assertEquals(token.length, 1);
  assertEquals(token[0].auth, `Basic ${btoa("pub_test:priv_test")}`);
  assertEquals(llamadas[1].auth, `Bearer ${jwt(exp)}`);
  assertEquals(llamadas[2].url, `${BASE}/api/transactions?limit=1`);
});

Deno.test("ante 401 renueva el token y después prueba sin 'Bearer'", async () => {
  _reiniciarEstado();
  const { f, llamadas } = fetchFalso(
    [{ status: 401 }, { status: 401 }, { status: 200, body: { ok: true } }],
    ["t1", "t2"],
  );
  const c = nuevo(f);
  assertEquals(await c.get("/api/x"), { ok: true });
  const api = llamadas.filter((l) => l.url.endsWith("/api/x")).map((l) => l.auth);
  assertEquals(api, ["Bearer t1", "Bearer t2", "t2"]);
  assertEquals(c.modoAutorizacion, "plano");
});

Deno.test("401 persistente termina en EcartPayError 401", async () => {
  _reiniciarEstado();
  const { f } = fetchFalso(
    [{ status: 401 }, { status: 401 }, { status: 401, body: { message: "Unauthorized" } }],
    ["t1", "t2"],
  );
  const e = await assertRejects(() => nuevo(f).get("/api/x"), EcartPayError);
  assertEquals(e.status, 401);
  assertEquals(e.message, "Unauthorized");
});

Deno.test("reintenta GET ante 5xx pero no POST", async () => {
  _reiniciarEstado();
  const g = fetchFalso([{ status: 503 }, { status: 200, body: [1] }], ["t"]);
  assertEquals(await nuevo(g.f).get("/api/x"), [1]);

  _reiniciarEstado();
  const p = fetchFalso([{ status: 503, body: { error: "caído" } }], ["t"]);
  const e = await assertRejects(() => nuevo(p.f).post("/api/orders", {}), EcartPayError);
  assertEquals(e.status, 503);
  assertEquals(p.llamadas.filter((l) => l.url.endsWith("/api/orders")).length, 1);
});

Deno.test("error al pedir el token", async () => {
  _reiniciarEstado();
  const f = (() =>
    Promise.resolve(Response.json({ message: "bad keys" }, { status: 400 }))) as typeof fetch;
  const e = await assertRejects(() => nuevo(f).token(), EcartPayError);
  assertEquals(e.status, 400);
});

Deno.test("OAuth: URL de autorización con client_id, redirect_uri y state", () => {
  const u = new URL(urlAutorizacionOAuth(BASE, "oauth_x", "https://x.co/cb?a=1", "st-1"));
  assertEquals(u.origin + u.pathname, `${BASE}/oauth`);
  assertEquals(u.searchParams.get("client_id"), "oauth_x");
  assertEquals(u.searchParams.get("redirect_uri"), "https://x.co/cb?a=1");
  assertEquals(u.searchParams.get("state"), "st-1");
});

Deno.test("OAuth: canje del code con Authorization y x-secret", async () => {
  let visto: { url: string; h: Headers; body: unknown } | null = null;
  const f = ((input: string | URL | Request, init?: RequestInit) => {
    visto = {
      url: String(input),
      h: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    };
    return Promise.resolve(
      Response.json({
        account_id: "acc1",
        public_id: "pub1",
        private_id: "prv1",
        scope: "read_orders,write_orders read_credentials",
      }),
    );
  }) as typeof fetch;
  const r = await canjearCodigoOAuth({
    baseUrl: BASE,
    app: { clientId: "oauth_x", clientSecret: "sec" },
    code: "COD",
    redirectUri: "https://x.co/cb",
    fetch: f,
  });
  assertEquals(r, {
    accountId: "acc1",
    publicId: "pub1",
    privateId: "prv1",
    scopes: ["read_orders", "write_orders", "read_credentials"],
  });
  const v = visto!;
  assertEquals(v.url, `${BASE}/api/oauth/token?client_id=oauth_x`);
  assertEquals(v.h.get("authorization"), "COD");
  assertEquals(v.h.get("x-secret"), "sec");
  assertEquals(v.body, { grant_type: "authorization_code", redirect_url: "https://x.co/cb" });
});

Deno.test("OAuth: code vencido devuelve EcartPayError con el mensaje", async () => {
  const f = (() =>
    Promise.resolve(
      Response.json({ message: "The token is not valid" }, { status: 401 }),
    )) as typeof fetch;
  const e = await assertRejects(
    () =>
      canjearCodigoOAuth({
        baseUrl: BASE,
        app: { clientId: "a", clientSecret: "b" },
        code: "viejo",
        redirectUri: "https://x.co/cb",
        fetch: f,
      }),
    EcartPayError,
  );
  assertEquals(e.status, 401);
  assertEquals(e.message, "The token is not valid");
});

Deno.test("órdenes: estados de Ecart Pay a estados de JPay", () => {
  assertEquals(resumirOrden({ status: "paid" }).estado, "pagado");
  assertEquals(resumirOrden({ status: "created" }).estado, "creado");
  assertEquals(resumirOrden({ status: "cancelled" }).estado, "cancelado");
  assertEquals(resumirOrden({ status: "partially_refunded" }).estado, "parcialmente_reembolsado");
  assertEquals(resumirOrden({ status: "algo_nuevo" }).estado, "pendiente");
  assertEquals(resumirOrden(null).estadoProveedor, "desconocido");
});

Deno.test("órdenes: último intento rechazado deja el pago rechazado con motivo", () => {
  const r = resumirOrden({
    status: "created",
    payments: [
      {
        id: "p1",
        status: "declined",
        status_detail: "Fondos insuficientes",
        method: { type: "card" },
      },
    ],
  });
  assertEquals(r, {
    estado: "rechazado",
    estadoProveedor: "created",
    motivo: "Fondos insuficientes",
    metodo: "card",
    pagoId: "p1",
  });
  // Un reintento aprobado manda sobre el rechazo anterior.
  assertEquals(
    resumirOrden({ status: "paid", payments: [{ status: "declined" }, { status: "paid" }] }).estado,
    "pagado",
  );
});

// Firma como el ejemplo de la documentación (Node), independiente de la implementación.
const firmaDoc = (secreto: string, ts: string, id: string, datos: string) =>
  "SHA256=" + createHmac("sha256", secreto).update(`${ts}.${id}.${datos}`).digest("hex");

Deno.test("webhooks: firma válida con { event, data }", async () => {
  const cuerpo = {
    event: "chargebacks.create",
    data: { id: "cb1", status: "created", monto: 1.5 },
  };
  const firma = firmaDoc("s3cr3t", "1700000000000", "hook_1", JSON.stringify(cuerpo.data));
  const base = { secreto: "s3cr3t", timestamp: "1700000000000", webhookId: "hook_1", cuerpo };
  assertEquals(await verificarFirmaWebhook({ ...base, firma }), true);
  assertEquals(await verificarFirmaWebhook({ ...base, firma: firma.toLowerCase() }), true);
  // Cualquier cambio invalida la firma.
  assertEquals(await verificarFirmaWebhook({ ...base, firma, secreto: "otro" }), false);
  assertEquals(await verificarFirmaWebhook({ ...base, firma, webhookId: "hook_2" }), false);
  assertEquals(
    await verificarFirmaWebhook({
      ...base,
      firma,
      cuerpo: { ...cuerpo, data: { ...cuerpo.data, status: "won" } },
    }),
    false,
  );
  assertEquals(await verificarFirmaWebhook({ ...base, firma: "SHA256=nohex" }), false);
});

Deno.test("webhooks: eventos de órdenes planos ({status, id})", async () => {
  const cuerpo = { status: "paid", id: "ord1" };
  const base = { secreto: "k", timestamp: "1", webhookId: "h", cuerpo };
  const plano = firmaDoc("k", "1", "h", JSON.stringify(cuerpo));
  const sinData = firmaDoc("k", "1", "h", "undefined");
  assertEquals(await verificarFirmaWebhook({ ...base, firma: plano }), true);
  assertEquals(await verificarFirmaWebhook({ ...base, firma: sinData }), true);
});

Deno.test("webhooks: evento e id, planos o dentro de data", () => {
  assertEquals(leerEventoWebhook({ status: "paid", id: "o1" }), {
    evento: null,
    idExterno: "o1",
    estado: "paid",
  });
  assertEquals(
    leerEventoWebhook({ event: "orders.update", data: { id: "o2", status: "cancelled" } }),
    {
      evento: "orders.update",
      idExterno: "o2",
      estado: "cancelled",
    },
  );
  assertEquals(leerEventoWebhook("basura"), { evento: null, idExterno: null, estado: null });
});

Deno.test("SPEI y OXXO: referencia de pago desde la orden pública", () => {
  // Ejemplos de la documentación (unique-transaction-clabe y oxxo-pay).
  const spei = {
    status: "pending",
    payments: [
      {
        id: "646010142603008203",
        status: "pending",
        type: "transfer",
        amount: 40999,
        method: { expires_at: "2025-11-02T18:33:00.331Z", reference: "646010142603008203" },
      },
    ],
  };
  assertEquals(leerReferenciaPago(spei, "spei"), {
    referencia: "646010142603008203",
    venceAt: "2025-11-02T18:33:00.331Z",
    url: null,
    monto: 409.99,
  });
  assertEquals(leerReferenciaPago(spei, "oxxo"), null);
  const oxxo = {
    payments: [
      {
        type: "cash",
        amount: 15000,
        method: {
          expires_at: "2026-08-31T18:00:00.000Z",
          reference: "98000014505724",
          barcode_url: "https://barcodes.digitalfemsa.io/sandbox_reference.png",
        },
      },
    ],
  };
  assertEquals(leerReferenciaPago(oxxo, "oxxo")?.referencia, "98000014505724");
  assertEquals(leerReferenciaPago(oxxo, "oxxo")?.monto, 150);
  assertEquals(leerReferenciaPago({}, "spei"), null);
});
