"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const BACKEND = "http://localhost:3000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoObjetivo = "deadline" | "habito";

interface Objetivo {
  id: string;
  nombre: string;
  tipo: TipoObjetivo;
  deadline?: string;
  meta?: number;
  unidad?: string;
  periodo?: string;
  progreso: number;
  creadoEn: string;
}

interface FormData {
  nombre: string;
  tipo: TipoObjetivo;
  deadline: string;
  meta: string;
  unidad: string;
  periodo: string;
}

const FORM_VACIO: FormData = {
  nombre: "",
  tipo: "deadline",
  deadline: "",
  meta: "",
  unidad: "",
  periodo: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function porcentaje(objetivo: Objetivo): number {
  if (objetivo.tipo === "habito" && objetivo.meta && objetivo.meta > 0) {
    return Math.min(100, Math.round((objetivo.progreso / objetivo.meta) * 100));
  }
  if (objetivo.tipo === "deadline") {
    return Math.min(100, Math.round(objetivo.progreso));
  }
  return 0;
}

function diasRestantes(deadline?: string): number | null {
  if (!deadline) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fin = new Date(deadline);
  fin.setHours(0, 0, 0, 0);
  return Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function etiquetaDias(dias: number): { texto: string; urgente: boolean } {
  if (dias < 0) return { texto: "Vencido", urgente: true };
  if (dias === 0) return { texto: "Hoy", urgente: true };
  if (dias === 1) return { texto: "Mañana", urgente: true };
  if (dias <= 7) return { texto: `${dias} días`, urgente: true };
  return { texto: `${dias} días`, urgente: false };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ObjetivosPage() {
  const { getToken } = useAuth();
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalProgreso, setModalProgreso] = useState<Objetivo | null>(null);
  const [nuevoProgreso, setNuevoProgreso] = useState("");
  const [form, setForm] = useState<FormData>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

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

  // ── Carga inicial ────────────────────────────────────────────────────────────

  async function cargarObjetivos() {
    setCargando(true);
    try {
      const res = await apiFetch(`${BACKEND}/api/objetivos`);
      const data = await res.json();
      setObjetivos(Array.isArray(data) ? data : []);
    } catch {
      setObjetivos([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarObjetivos();
  }, []);

  // ── Crear objetivo ────────────────────────────────────────────────────────────

  async function crearObjetivo() {
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (form.tipo === "habito" && (!form.meta || isNaN(Number(form.meta)))) {
      setError("Introduce una meta numérica para el hábito.");
      return;
    }

    setGuardando(true);
    setError("");

    const body: Record<string, unknown> = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      progreso: 0,
    };

    if (form.tipo === "deadline" && form.deadline) {
      body.deadline = form.deadline;
    }
    if (form.tipo === "habito") {
      body.meta = Number(form.meta);
      if (form.unidad.trim()) body.unidad = form.unidad.trim();
      if (form.periodo.trim()) body.periodo = form.periodo.trim();
    }

    try {
      const res = await apiFetch(`${BACKEND}/api/objetivos`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error();

      setModalAbierto(false);
      setForm(FORM_VACIO);
      await cargarObjetivos();
    } catch {
      setError("Error al guardar. Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  // ── Actualizar progreso ───────────────────────────────────────────────────────

  async function actualizarProgreso() {
    if (!modalProgreso) return;
    const valor = Number(nuevoProgreso);
    if (isNaN(valor) || valor < 0) return;

    try {
      await apiFetch(`${BACKEND}/api/objetivos/${modalProgreso.id}`, {
        method: "PATCH",
        body: JSON.stringify({ progreso: valor }),
      });
      setModalProgreso(null);
      setNuevoProgreso("");
      await cargarObjetivos();
    } catch {
      // silencioso por ahora
    }
  }

  // ── Eliminar objetivo ─────────────────────────────────────────────────────────

  async function eliminarObjetivo(id: string) {
    if (!confirm("¿Eliminar este objetivo?")) return;
    try {
      await apiFetch(`${BACKEND}/api/objetivos/${id}`, { method: "DELETE" });
      await cargarObjetivos();
    } catch {
      // silencioso
    }
  }

  // ── Separar por tipo ──────────────────────────────────────────────────────────

  const deadlines = objetivos.filter((o) => o.tipo === "deadline");
  const habitos = objetivos.filter((o) => o.tipo === "habito");

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 32px 80px", maxWidth: 720 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", margin: 0 }}>Objetivos</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
            {objetivos.length === 0 ? "Sin objetivos activos" : `${objetivos.length} activo${objetivos.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => { setModalAbierto(true); setForm(FORM_VACIO); setError(""); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 10,
            background: "#4F46E5", color: "#fff",
            border: "none", cursor: "pointer",
            fontSize: 14, fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Nuevo objetivo
        </button>
      </div>

      {/* Estado de carga */}
      {cargando && (
        <div style={{ color: "#6B7280", fontSize: 14, padding: "40px 0", textAlign: "center" }}>
          Cargando objetivos...
        </div>
      )}

      {/* Estado vacío */}
      {!cargando && objetivos.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          border: "1.5px dashed #E5E7EB", borderRadius: 14,
          color: "#6B7280",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <p style={{ fontSize: 15, fontWeight: 500, color: "#1A1A1A", margin: "0 0 6px" }}>
            Sin objetivos todavía
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>
            Crea tu primer objetivo para que la IA pueda ayudarte a planificarlo.
          </p>
        </div>
      )}

      {/* Objetivos con deadline */}
      {!cargando && deadlines.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Con fecha límite
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {deadlines.map((obj) => (
              <TarjetaDeadline
                key={obj.id}
                objetivo={obj}
                onEliminar={() => eliminarObjetivo(obj.id)}
                onActualizarProgreso={() => {
                  setModalProgreso(obj);
                  setNuevoProgreso(String(obj.progreso));
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Hábitos cuantificables */}
      {!cargando && habitos.length > 0 && (
        <section>
          <h2 style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Hábitos
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {habitos.map((obj) => (
              <TarjetaHabito
                key={obj.id}
                objetivo={obj}
                onEliminar={() => eliminarObjetivo(obj.id)}
                onActualizarProgreso={() => {
                  setModalProgreso(obj);
                  setNuevoProgreso(String(obj.progreso));
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Modal: Crear objetivo ──────────────────────────────────────────── */}
      {modalAbierto && (
        <Overlay onClick={() => setModalAbierto(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16,
              padding: "28px 28px 24px",
              width: "100%", maxWidth: 440,
              boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 20px", color: "#1A1A1A" }}>
              Nuevo objetivo
            </h2>

            {/* Nombre */}
            <Campo label="Nombre">
              <input
                autoFocus
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Aprobar redes en junio"
                style={estiloInput}
              />
            </Campo>

            {/* Tipo */}
            <Campo label="Tipo">
              <div style={{ display: "flex", gap: 8 }}>
                {(["deadline", "habito"] as TipoObjetivo[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, tipo: t })}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                      fontSize: 13, fontWeight: 500,
                      border: form.tipo === t ? "2px solid #4F46E5" : "1.5px solid #E5E7EB",
                      background: form.tipo === t ? "#EEF2FF" : "#fff",
                      color: form.tipo === t ? "#4F46E5" : "#6B7280",
                    }}
                  >
                    {t === "deadline" ? "📅 Con fecha límite" : "🔁 Hábito"}
                  </button>
                ))}
              </div>
            </Campo>

            {/* Campos condicionales */}
            {form.tipo === "deadline" && (
              <Campo label="Fecha límite">
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  style={estiloInput}
                />
              </Campo>
            )}

            {form.tipo === "habito" && (
              <>
                <div style={{ display: "flex", gap: 10 }}>
                  <Campo label="Meta" style={{ flex: 1 }}>
                    <input
                      type="number"
                      value={form.meta}
                      onChange={(e) => setForm({ ...form, meta: e.target.value })}
                      placeholder="12"
                      style={estiloInput}
                    />
                  </Campo>
                  <Campo label="Unidad" style={{ flex: 1 }}>
                    <input
                      value={form.unidad}
                      onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                      placeholder="libros, km, horas…"
                      style={estiloInput}
                    />
                  </Campo>
                </div>
                <Campo label="Periodo">
                  <input
                    value={form.periodo}
                    onChange={(e) => setForm({ ...form, periodo: e.target.value })}
                    placeholder="este año, este mes…"
                    style={estiloInput}
                  />
                </Campo>
              </>
            )}

            {error && (
              <p style={{ fontSize: 13, color: "#DC2626", margin: "0 0 12px" }}>{error}</p>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => setModalAbierto(false)}
                style={{ ...estiloBotonSecundario, flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={crearObjetivo}
                disabled={guardando}
                style={{ ...estiloBotonPrimario, flex: 2, opacity: guardando ? 0.7 : 1 }}
              >
                {guardando ? "Guardando…" : "Crear objetivo"}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ── Modal: Actualizar progreso ─────────────────────────────────────── */}
      {modalProgreso && (
        <Overlay onClick={() => setModalProgreso(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16,
              padding: "28px 28px 24px",
              width: "100%", maxWidth: 360,
              boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 4px", color: "#1A1A1A" }}>
              Actualizar progreso
            </h2>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 20px" }}>
              {modalProgreso.nombre}
            </p>

            <Campo
              label={
                modalProgreso.tipo === "habito" && modalProgreso.unidad
                  ? `Progreso actual (${modalProgreso.unidad})`
                  : "Progreso (0–100%)"
              }
            >
              <input
                autoFocus
                type="number"
                value={nuevoProgreso}
                onChange={(e) => setNuevoProgreso(e.target.value)}
                min={0}
                max={modalProgreso.tipo === "habito" ? undefined : 100}
                style={estiloInput}
              />
            </Campo>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setModalProgreso(null)} style={{ ...estiloBotonSecundario, flex: 1 }}>
                Cancelar
              </button>
              <button onClick={actualizarProgreso} style={{ ...estiloBotonPrimario, flex: 2 }}>
                Guardar
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Tarjeta: Objetivo con deadline ───────────────────────────────────────────

function TarjetaDeadline({
  objetivo,
  onEliminar,
  onActualizarProgreso,
}: {
  objetivo: Objetivo;
  onEliminar: () => void;
  onActualizarProgreso: () => void;
}) {
  const pct = porcentaje(objetivo);
  const dias = diasRestantes(objetivo.deadline);
  const etiqueta = dias !== null ? etiquetaDias(dias) : null;
  const completado = pct >= 100;

  return (
    <div style={{
      background: "#fff",
      border: "1.5px solid #E5E7EB",
      borderRadius: 14,
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: completado ? "#059669" : "#1A1A1A" }}>
              {completado && "✓ "}{objetivo.nombre}
            </span>
            {etiqueta && (
              <span style={{
                fontSize: 11, fontWeight: 500,
                padding: "2px 8px", borderRadius: 99,
                background: etiqueta.urgente ? "#FEF3C7" : "#F3F4F6",
                color: etiqueta.urgente ? "#D97706" : "#6B7280",
              }}>
                {etiqueta.texto}
              </span>
            )}
          </div>
          {objetivo.deadline && (
            <p style={{ fontSize: 12, color: "#6B7280", margin: "3px 0 0" }}>
              Límite: {new Date(objetivo.deadline).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        <MenuAcciones onActualizar={onActualizarProgreso} onEliminar={onEliminar} />
      </div>

      {/* Barra de progreso */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: completado ? "#059669" : "#4F46E5",
            borderRadius: 99,
            transition: "width 0.4s ease",
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: completado ? "#059669" : "#4F46E5", minWidth: 34, textAlign: "right" }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

// ─── Tarjeta: Hábito cuantificable ────────────────────────────────────────────

function TarjetaHabito({
  objetivo,
  onEliminar,
  onActualizarProgreso,
}: {
  objetivo: Objetivo;
  onEliminar: () => void;
  onActualizarProgreso: () => void;
}) {
  const pct = porcentaje(objetivo);
  const completado = objetivo.meta !== undefined && objetivo.progreso >= objetivo.meta;

  return (
    <div style={{
      background: "#fff",
      border: "1.5px solid #E5E7EB",
      borderRadius: 14,
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 600, color: completado ? "#059669" : "#1A1A1A" }}>
            {completado && "✓ "}{objetivo.nombre}
          </span>
          {objetivo.periodo && (
            <p style={{ fontSize: 12, color: "#6B7280", margin: "3px 0 0" }}>
              {objetivo.periodo}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Contador */}
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: completado ? "#059669" : "#16A34A",
            background: completado ? "#F0FDF4" : "#F0FDF4",
            padding: "4px 10px", borderRadius: 8,
          }}>
            {objetivo.progreso}{objetivo.unidad ? ` ${objetivo.unidad}` : ""}
            {objetivo.meta !== undefined && (
              <span style={{ fontWeight: 400, color: "#6B7280" }}>
                {" "}/ {objetivo.meta}
              </span>
            )}
          </span>
          <MenuAcciones onActualizar={onActualizarProgreso} onEliminar={onEliminar} />
        </div>
      </div>

      {/* Barra de progreso */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: completado ? "#059669" : "#16A34A",
            borderRadius: 99,
            transition: "width 0.4s ease",
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: completado ? "#059669" : "#16A34A", minWidth: 34, textAlign: "right" }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function Overlay({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

function Campo({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function MenuAcciones({ onActualizar, onEliminar }: { onActualizar: () => void; onEliminar: () => void }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setAbierto(!abierto)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#6B7280", fontSize: 18, padding: "0 4px", lineHeight: 1,
        }}
        title="Opciones"
      >
        ···
      </button>
      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
          <div style={{
            position: "absolute", right: 0, top: "100%", zIndex: 20,
            background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            minWidth: 160, overflow: "hidden",
          }}>
            <button
              onClick={() => { setAbierto(false); onActualizar(); }}
              style={estiloItemMenu}
            >
              ✏️ Actualizar progreso
            </button>
            <button
              onClick={() => { setAbierto(false); onEliminar(); }}
              style={{ ...estiloItemMenu, color: "#DC2626" }}
            >
              🗑️ Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Estilos reutilizables ────────────────────────────────────────────────────

const estiloInput: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  border: "1.5px solid #E5E7EB", borderRadius: 8,
  fontSize: 14, color: "#1A1A1A",
  outline: "none", boxSizing: "border-box",
  background: "#FAFAF9",
};

const estiloBotonPrimario: React.CSSProperties = {
  padding: "10px 0", borderRadius: 10,
  background: "#4F46E5", color: "#fff",
  border: "none", cursor: "pointer",
  fontSize: 14, fontWeight: 500,
};

const estiloBotonSecundario: React.CSSProperties = {
  padding: "10px 0", borderRadius: 10,
  background: "#F3F4F6", color: "#1A1A1A",
  border: "none", cursor: "pointer",
  fontSize: 14, fontWeight: 500,
};

const estiloItemMenu: React.CSSProperties = {
  display: "block", width: "100%",
  padding: "10px 14px", textAlign: "left",
  background: "none", border: "none",
  cursor: "pointer", fontSize: 13,
  color: "#1A1A1A",
};