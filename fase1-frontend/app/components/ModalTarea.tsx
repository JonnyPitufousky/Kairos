"use client";
import { useState } from "react";

const PRIORIDAD_CONFIG = {
  alta:  { label: "Alta",  color: "#EF4444", bg: "#FEF2F2" },
  media: { label: "Media", color: "#D97706", bg: "#FFFBEB" },
  baja:  { label: "Baja",  color: "#059669", bg: "#F0FDF4" },
};

interface ModalTareaProps {
  titulo: string;
  boton: string;
  fechaInicial?: string; // pre-rellena la fecha
  onSubmit: (datos: {
    titulo: string;
    descripcion: string | null;
    prioridad: "baja" | "media" | "alta";
    fecha_vencimiento: string;
  }) => void;
  onCerrar: () => void;
}

export default function ModalTarea({ titulo, boton, fechaInicial = "", onSubmit, onCerrar }: ModalTareaProps) {
  const [formTitulo, setFormTitulo] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formPrioridad, setFormPrioridad] = useState<"baja" | "media" | "alta">("media");
  const [formFecha, setFormFecha] = useState(fechaInicial);
  const [formHoraInicio, setFormHoraInicio] = useState("");
  const [formHoraFin, setFormHoraFin] = useState("");
  const [errorHoras, setErrorHoras] = useState("");

  function buildFechaVencimiento(): string {
    if (!formFecha) return "";
    if (formHoraInicio && formHoraFin) return `${formFecha}T${formHoraInicio}:00|${formHoraFin}`;
    if (formHoraInicio) return `${formFecha}T${formHoraInicio}:00`;
    return `${formFecha}T00:00:00`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitulo.trim() || !formFecha) return;
    if (formHoraInicio && formHoraFin && formHoraInicio >= formHoraFin) {
      setErrorHoras("La hora de inicio debe ser anterior a la hora de fin.");
      return;
    }
    setErrorHoras("");
    onSubmit({
      titulo: formTitulo,
      descripcion: formDescripcion || null,
      prioridad: formPrioridad,
      fecha_vencimiento: buildFechaVencimiento(),
    });
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#FFFFFF", borderRadius: 14, padding: "28px 24px", width: "100%", maxWidth: 440, margin: "0 16px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", margin: "0 0 20px" }}>{titulo}</h3>
        <form onSubmit={handleSubmit}>

          {/* Título */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Título *</label>
            <input
              value={formTitulo} onChange={e => setFormTitulo(e.target.value)}
              placeholder="¿Qué necesitas hacer?" autoFocus required
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", fontSize: 15, color: "#1A1A1A", outline: "none", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>

          {/* Descripción */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Descripción</label>
            <textarea
              value={formDescripcion} onChange={e => setFormDescripcion(e.target.value)}
              placeholder="Notas adicionales..." rows={2}
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#1A1A1A", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>

          {/* Fecha */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fecha límite *</label>
            <input
              type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)} required
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#1A1A1A", outline: "none", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>

          {/* Periodo horario */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Periodo horario
              <span style={{ fontSize: 10, fontWeight: 400, color: "#D1D5DB", marginLeft: 6 }}>opcional</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="time" value={formHoraInicio} onChange={e => { setFormHoraInicio(e.target.value); setErrorHoras(""); }}
                style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "9px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
              />
              <span style={{ fontSize: 13, color: "#9CA3AF", flexShrink: 0 }}>→</span>
              <input
                type="time" value={formHoraFin} onChange={e => { setFormHoraFin(e.target.value); setErrorHoras(""); }}
                style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "9px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
              />
            </div>
            {formHoraInicio && !formHoraFin && (
              <p style={{ fontSize: 11, color: "#D97706", marginTop: 5 }}>Añade hora de fin para activar la detección automática</p>
            )}
            {errorHoras && (
              <p style={{ fontSize: 11, color: "#EF4444", marginTop: 5, fontWeight: 500 }}>{errorHoras}</p>
            )}
          </div>

          {/* Prioridad */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prioridad</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["baja", "media", "alta"] as const).map(p => (
                <button
                  key={p} type="button" onClick={() => setFormPrioridad(p)}
                  style={{ flex: 1, padding: "9px 0", border: "1.5px solid", borderColor: formPrioridad === p ? PRIORIDAD_CONFIG[p].color : "#E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: formPrioridad === p ? PRIORIDAD_CONFIG[p].color : "#9CA3AF", background: formPrioridad === p ? PRIORIDAD_CONFIG[p].bg : "#FFFFFF", transition: "all 0.12s" }}
                >
                  {PRIORIDAD_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCerrar} style={{ background: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <button type="submit" style={{ background: "#6366F1", color: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{boton}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
