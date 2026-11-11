import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mensajeError } from "@/shared/errores";
import { DataTable, type Column } from "./data-table";
import { EstadoConsulta, ErrorCarga } from "./estado-carga";
import { FormDialog } from "./form-dialog";
import { KpiCard } from "./kpi-card";

afterEach(cleanup);

const consulta = <T,>(
  o: Partial<{ data: T; isPending: boolean; isError: boolean; error: unknown }>,
) => ({
  data: undefined as T | undefined,
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
  ...o,
});

describe("KpiCard", () => {
  it("mientras carga no muestra el valor (nunca $0)", () => {
    render(<KpiCard label="Saldo" value="$0.00" sub="hoy" loading />);
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.queryByText("hoy")).toBeNull();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeTruthy();
  });
  it("con datos muestra el valor", () => {
    render(<KpiCard label="Saldo" value="$10.00" />);
    expect(screen.getByText("$10.00")).toBeTruthy();
  });
});

describe("EstadoConsulta", () => {
  it("cargando → gris, no el contenido", () => {
    render(
      <EstadoConsulta q={consulta<string[]>({ isPending: true })}>{() => "vacío"}</EstadoConsulta>,
    );
    expect(screen.queryByText("vacío")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });
  it("error sin datos → No se pudo cargar + Reintentar", () => {
    const q = consulta<string[]>({ isError: true, error: new Error("boom") });
    render(<EstadoConsulta q={q}>{() => "vacío"}</EstadoConsulta>);
    expect(screen.getByText("No se pudo cargar la información")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(q.refetch).toHaveBeenCalled();
  });
  it("si falla un refresco pero hay datos, sigue mostrando los datos", () => {
    const q = consulta<string[]>({ data: ["a"], isError: true, error: new Error("x") });
    render(<EstadoConsulta q={q}>{(d) => `filas ${d.length}`}</EstadoConsulta>);
    expect(screen.getByText("filas 1")).toBeTruthy();
  });
  it("lista vacía que llegó bien → muestra el contenido (su propio vacío)", () => {
    render(
      <EstadoConsulta q={consulta<string[]>({ data: [] })}>
        {(d) => `filas ${d.length}`}
      </EstadoConsulta>,
    );
    expect(screen.getByText("filas 0")).toBeTruthy();
  });
});

describe("DataTable", () => {
  type Fila = { n: string };
  const cols: Column<Fila>[] = [{ key: "n", label: "Nombre", render: (r) => r.n }];
  it("con error no dice «Sin datos»", () => {
    render(
      <DataTable
        columns={cols}
        data={[] as Fila[]}
        keyExtractor={(r) => r.n}
        error={new Error("x")}
      />,
    );
    expect(screen.queryByText("Sin datos")).toBeNull();
    expect(screen.getByText("No se pudo cargar la información")).toBeTruthy();
  });
});

describe("ErrorCarga y mensajeError", () => {
  it("traduce el error de red", () => {
    expect(mensajeError(new TypeError("Failed to fetch"))).toMatch(/conexión/);
    expect(mensajeError({ message: "permiso denegado" })).toBe("permiso denegado");
    expect(mensajeError(null)).toBe("");
  });
  it("sin onRetry no muestra el botón", () => {
    render(<ErrorCarga error="x" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("FormDialog", () => {
  it("con onSubmit asíncrono bloquea el botón y no envía dos veces", async () => {
    let terminar: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((r) => (terminar = r)));
    render(
      <FormDialog open onClose={() => {}} title="Nuevo" onSubmit={onSubmit} submitLabel="Guardar">
        <span />
      </FormDialog>,
    );
    const btn = screen.getByRole("button", { name: /Guardar/ }) as HTMLButtonElement;
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(btn.disabled).toBe(true));
    terminar();
    await waitFor(() => expect(btn.disabled).toBe(false));
  });
});
