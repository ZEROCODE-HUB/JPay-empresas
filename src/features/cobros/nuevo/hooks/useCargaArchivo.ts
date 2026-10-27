import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { csvAFilas, esExcel, validarFilas, type FilaCarga, type FilaCruda } from "../../carga";

/** Lectura (CSV o Excel) y validación del archivo de registros del lote. */
export function useCargaArchivo() {
  const [subiendo, setSubiendo] = useState(false);
  const [filas, setFilas] = useState<FilaCarga[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState("");

  const procesarArchivo = (file: File) => {
    setNombreArchivo(file.name);
    setSubiendo(true);

    const onError = (msg: string) => {
      toast.error(msg);
      setSubiendo(false);
    };

    const aplicar = (rawRows: FilaCruda[]) => {
      const res = validarFilas(rawRows);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      setFilas(res.filas);
      toast.success(`${res.filas.length} registros validos cargados`);
      setSubiendo(false);
    };

    const reader = new FileReader();
    reader.onerror = () => onError("Error al leer el archivo");

    if (esExcel(file.name)) {
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<FilaCruda>(ws);
          if (json.length === 0) {
            onError("El archivo no contiene datos");
            return;
          }
          aplicar(json);
        } catch {
          onError("Error al procesar el archivo XLSX");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        try {
          const rawRows = csvAFilas(e.target?.result as string);
          if (!rawRows) {
            onError("El archivo debe contener al menos un encabezado y una fila de datos");
            return;
          }
          aplicar(rawRows);
        } catch {
          onError("Error al procesar el archivo CSV");
        }
      };
      reader.readAsText(file);
    }
  };

  const limpiar = () => {
    setFilas([]);
    setNombreArchivo("");
  };

  return { subiendo, filas, nombreArchivo, procesarArchivo, limpiar };
}
