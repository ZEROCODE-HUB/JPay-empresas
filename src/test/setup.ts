import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { PAIS_INSTALACION, setPaisActivo } from "@/shared/pais";

// Los tests que cambian de país (setPaisActivo) no afectan a los siguientes.
afterEach(() => setPaisActivo(PAIS_INSTALACION));
