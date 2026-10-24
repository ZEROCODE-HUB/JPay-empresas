import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { brand, pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/registro/empresa")({
  head: () => ({
    meta: [
      { title: pageTitle("Registrar empresa") },
      { name: "description", content: `Registra tu empresa en ${brand.name}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RedirectToLogin,
});

function RedirectToLogin() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/login", search: { register: "pj" }, replace: true });
  }, [navigate]);
  return null;
}