import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SolicitudActivacion } from "./SolicitudActivacion";

const enviar = vi.fn();
let ultima: { data: unknown } = { data: null };

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/useCuenta", () => ({
  useClienteSesion: () => ({
    cliente: {
      nombre: "Comercializadora Demo",
      telefono: "5512345678",
      correo: "demo@empresa.mx",
    },
  }),
}));
vi.mock("@/hooks/useSolicitudes", () => ({
  useUltimaSolicitud: () => ultima,
  useSolicitarContacto: () => ({ mutateAsync: enviar, isPending: false }),
}));

const props = {
  servicio: "cobros_tarjeta" as const,
  comercioId: "com-1",
  etiqueta: "Contactar a soporte para activación",
  titulo: "Activar cobros con tarjeta",
  descripcion: "Confirma tus datos",
};

beforeEach(() => {
  enviar.mockReset().mockResolvedValue(undefined);
  ultima = { data: null };
});
afterEach(cleanup);

describe("SolicitudActivacion", () => {
  it("abre el formulario prellenado con los datos de la cuenta y lo envía", async () => {
    render(<SolicitudActivacion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Contactar a soporte/ }));

    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(
      "Comercializadora Demo",
    );
    expect((screen.getByLabelText("Teléfono") as HTMLInputElement).value).toBe("5512345678");
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("demo@empresa.mx");

    fireEvent.change(screen.getByLabelText("Comentarios (opcional)"), {
      target: { value: "Vendo en línea" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar).toHaveBeenCalledWith({
      servicio: "cobros_tarjeta",
      comercioId: "com-1",
      nombre: "Comercializadora Demo",
      telefono: "5512345678",
      correo: "demo@empresa.mx",
      mensaje: "Vendo en línea",
    });
  });

  it("no envía si el teléfono o el correo no son válidos", async () => {
    render(<SolicitudActivacion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Contactar a soporte/ }));
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "123" } });
    // «a@b» pasa la validación propia del navegador pero no la nuestra (falta el dominio completo).
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "a@b" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByText("Escribe un teléfono de 10 dígitos")).toBeTruthy();
    expect(screen.getByText("Escribe un correo válido")).toBeTruthy();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("con una solicitud abierta avisa que ya se recibió y deja corregirla", () => {
    ultima = {
      data: {
        id: "s1",
        nombre: "Ana",
        telefono: "5599998888",
        correo: "ana@empresa.mx",
        mensaje: null,
        estado: "nueva",
        createdAt: "2026-11-26T12:00:00Z",
      },
    };
    render(<SolicitudActivacion {...props} />);

    expect(screen.getByText(/Recibimos tu solicitud/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Contactar a soporte/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Corregir mis datos" }));
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Ana");
    expect(screen.getByRole("button", { name: "Actualizar solicitud" })).toBeTruthy();
  });
});
