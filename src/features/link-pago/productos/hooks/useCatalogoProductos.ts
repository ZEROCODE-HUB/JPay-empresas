import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Product } from "@/data/links-pago";
import { useEliminarProducto, useGuardarProducto, useProductos } from "@/hooks/useLinksPago";
import { filtrarProductos, toProduct } from "../utils";

/** Productos del cliente: listado, selección, alta/edición y baja. */
export function useCatalogoProductos(legajo: string | undefined) {
  const productosQuery = useProductos(legajo);
  const guardarProducto = useGuardarProducto(legajo);
  const eliminarProducto = useEliminarProducto(legajo);

  const products = useMemo(() => (productosQuery.data ?? []).map(toProduct), [productosQuery.data]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmarEliminarId, setConfirmarEliminarId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const productosFiltrados = useMemo(
    () => filtrarProductos(products, busqueda),
    [products, busqueda],
  );

  const abrirNuevo = () => {
    setEditing(null);
    setShowForm(true);
  };
  const abrirEditar = (p: Product) => {
    setEditing(p);
    setShowForm(true);
  };
  const cerrarForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleTodos = (checked: boolean) => setSelected(checked ? products.map((p) => p.id) : []);

  const deleteProduct = async (id: string) => {
    try {
      await eliminarProducto.mutateAsync(id);
    } catch {
      toast.error("No se pudo eliminar");
      return;
    }
    setSelected((prev) => prev.filter((x) => x !== id));
    toast.success("Producto eliminado");
  };

  const saveProduct = async (product: Product) => {
    const payload = {
      cliente_legajo: legajo ?? "",
      nombre: product.name,
      descripcion: product.desc ?? null,
      precio: product.price,
      cantidad: product.qty,
    };
    try {
      await guardarProducto.mutateAsync({ id: editing?.id, payload });
    } catch {
      toast.error(editing ? "No se pudo actualizar" : "No se pudo crear");
      return;
    }
    toast.success(editing ? "Producto actualizado" : "Producto creado");
    cerrarForm();
  };

  return {
    products,
    productosFiltrados,
    busqueda,
    setBusqueda,
    selected,
    setSelected,
    toggleSelected,
    toggleTodos,
    showForm,
    editing,
    abrirNuevo,
    abrirEditar,
    cerrarForm,
    saveProduct,
    confirmarEliminarId,
    setConfirmarEliminarId,
    deleteProduct,
  };
}

export type CatalogoProductos = ReturnType<typeof useCatalogoProductos>;
