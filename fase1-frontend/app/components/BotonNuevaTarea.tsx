"use client";
import { useState } from "react";
import ModalTarea from "./ModalTarea";
import { useAuth } from "@clerk/nextjs";

const BACKEND = "http://localhost:3000";

interface BotonNuevaTareaProps {
  fechaInicial?: string;
  onTareaCreada?: () => void;
}

export default function BotonNuevaTarea({ fechaInicial = "", onTareaCreada }: BotonNuevaTareaProps) {
  const { getToken } = useAuth();
  const [mostrarModal, setMostrarModal] = useState(false);
  const [hover, setHover] = useState(false);

  async function apiFetch(url: string, options: RequestInit = {}) {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  }

  async function crearTarea(datos: {
    titulo: string;
    descripcion: string | null;
    prioridad: "baja" | "media" | "alta";
    fecha_vencimiento: string;
  }) {
    await apiFetch(`${BACKEND}/api/tareas`, {
      method: "POST",
      body: JSON.stringify(datos),
    });
    setMostrarModal(false);
    onTareaCreada?.();
  }

  return (
    <>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ position: "fixed", bottom: 32, right: 32, zIndex: 50 }}
      >
        <button
          onClick={() => setMostrarModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: hover ? 10 : 0,
            background: "#6366F1",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 99,
            height: 52,
            padding: hover ? "0 22px 0 18px" : "0 16px",
            cursor: "pointer",
            boxShadow: hover
              ? "0 8px 24px rgba(99,102,241,0.45)"
              : "0 4px 16px rgba(99,102,241,0.35)",
            transition: "all 0.3s ease",
            overflow: "hidden",
            justifyContent: "center",
            minWidth: 52,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{
              flexShrink: 0,
              transition: "transform 0.3s ease",
              transform: hover ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: "nowrap",
            maxWidth: hover ? 120 : 0,
            opacity: hover ? 1 : 0,
            overflow: "hidden",
            transition: "max-width 0.3s ease, opacity 0.2s ease 0.1s",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            Nueva tarea
          </span>
        </button>
      </div>

      {mostrarModal && (
        <ModalTarea
          titulo="Nueva tarea"
          boton="Crear tarea"
          fechaInicial={fechaInicial}
          onSubmit={crearTarea}
          onCerrar={() => setMostrarModal(false)}
        />
      )}
    </>
  );
}