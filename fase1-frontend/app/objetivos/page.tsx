"use client";
const estiloAnimacion = `
  @keyframes flotarArriba {
    0%   { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-28px); }
  }
`;
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const BACKEND = "http://localhost:3000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoObjetivo = "simple" | "avanzado";
type Periodo = "diario" | "semanal" | "mensual";

interface Objetivo {
  id: string;
  nombre: string;
  tipo: TipoObjetivo;
  deadline?: string;
  meta?: number;
  unidad?: string;
  periodo?: Periodo;
  progreso: number;
  creadoEn: string;
}

interface FormData {
  nombre: string;
  tipo: TipoObjetivo;
  deadline: string;
  meta: string;
  unidad: string;
  periodo: Periodo;
}

const FORM_VACIO: FormData = {
  nombre: "",
  tipo: "simple",
  deadline: "",
  meta: "",
  unidad: "",
  periodo: "diario",
};

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "diario",  label: "Cada día" },
  { value: "semanal", label: "Cada semana" },
  { value: "mensual", label: "Cada mes" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(objetivo: Objetivo): number {
  if (!objetivo.meta || objetivo.meta <= 0) return 0;
  return Math.min(100, Math.round((objetivo.progreso / objetivo.meta) * 100));
}

function chipDeadline(deadline?: string): { texto: string; urgente: boolean } | null {
  if (!deadline) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fin = new Date(deadline); fin.setHours(0, 0, 0, 0);
  const dias = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  if (dias < 0)   return { texto: "Vencido",       urgente: true };
  if (dias === 0) return { texto: "Hoy",            urgente: true };
  if (dias === 1) return { texto: "Mañana",         urgente: true };
  if (dias <= 7)  return { texto: `${dias} días`,   urgente: true };
  return {
    texto: new Date(deadline).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
    urgente: false,
  };
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ObjetivosPage() {
  const { getToken } = useAuth();
  const [objetivos, setObjetivos]                 = useState<Objetivo[]>([]);
  const [cargando, setCargando]                   = useState(true);
  const [modalCrear, setModalCrear]               = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState<Objetivo | null>(null);
  const [form, setForm]                           = useState<FormData>(FORM_VACIO);
  const [guardando, setGuardando]                 = useState(false);
  const [errorForm, setErrorForm]                 = useState("");

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

  useEffect(() => { cargarObjetivos(); }, []);

  // ── Crear ─────────────────────────────────────────────────────────────────

  async function crearObjetivo() {
    setErrorForm("");
    if (!form.nombre.trim()) { setErrorForm("El nombre es obligatorio."); return; }
    if (form.tipo === "avanzado") {
      if (!form.deadline)                         { setErrorForm("La fecha límite es obligatoria."); return; }
      if (!form.meta || isNaN(Number(form.meta))) { setErrorForm("La meta debe ser un número."); return; }
      if (!form.unidad.trim())                    { setErrorForm("La unidad es obligatoria."); return; }
    }

    setGuardando(true);
    try {
      const body: Record<string, unknown> = { nombre: form.nombre.trim(), tipo: form.tipo };
      if (form.tipo === "simple" && form.deadline) body.deadline = form.deadline;
      if (form.tipo === "avanzado") {
        body.deadline = form.deadline;
        body.meta     = Number(form.meta);
        body.unidad   = form.unidad.trim();
        body.periodo  = form.periodo;
      }

      const res = await apiFetch(`${BACKEND}/api/objetivos`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); setErrorForm(e.error || "Error al guardar."); return; }
      setModalCrear(false);
      setForm(FORM_VACIO);
      cargarObjetivos();
    } catch {
      setErrorForm("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  }

  // ── Completar simple (toggle) ─────────────────────────────────────────────

  async function toggleSimple(objetivo: Objetivo) {
    await apiFetch(`${BACKEND}/api/objetivos/${objetivo.id}`, {
      method: "PUT",
      body: JSON.stringify({ progreso: objetivo.progreso >= 100 ? 0 : 100 }),
    });
    cargarObjetivos();
  }

  // ── Progreso avanzado (+/−) ───────────────────────────────────────────────

  async function cambiarProgreso(objetivo: Objetivo, delta: number) {
    const nuevo = Math.max(0, objetivo.progreso + delta);
    // Actualiza localmente sin recargar
    setObjetivos(prev =>
      prev.map(o => o.id === objetivo.id ? { ...o, progreso: nuevo } : o)
    );
    // Sincroniza con backend en silencio
    await apiFetch(`${BACKEND}/api/objetivos/${objetivo.id}`, {
      method: "PUT",
      body: JSON.stringify({ progreso: nuevo }),
    });
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────

  async function eliminarObjetivo(id: string) {
    await apiFetch(`${BACKEND}/api/objetivos/${id}`, { method: "DELETE" });
    setConfirmarEliminar(null);
    cargarObjetivos();
  }

  const simples   = objetivos.filter(o => o.tipo === "simple");
  const avanzados = objetivos.filter(o => o.tipo === "avanzado");

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#FAFAF9", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {cargando ? " " : objetivos.length === 0 ? "Sin objetivos activos" : `${objetivos.length} activo${objetivos.length !== 1 ? "s" : ""}`}
              </p>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1A1A1A", margin: 0, letterSpacing: "-0.5px" }}>
                Objetivos
              </h1>
            </div>
            <button
              onClick={() => { setForm(FORM_VACIO); setErrorForm(""); setModalCrear(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#4F46E5", color: "#fff", border: "none",
                borderRadius: 10, padding: "9px 16px", cursor: "pointer",
                fontSize: 14, fontWeight: 600, marginTop: 4,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo objetivo
            </button>
          </div>
        </div>

        {/* Cargando */}
        {cargando && (
          <p style={{ textAlign: "center", color: "#9CA3AF", padding: "40px 0", fontSize: 14 }}>Cargando...</p>
        )}

        {/* Vacío */}
        {!cargando && objetivos.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", border: "1.5px dashed #E5E7EB", borderRadius: 14 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px" }}>Sin objetivos todavía</p>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
              Crea tu primer objetivo para que la IA pueda ayudarte a planificarlo.
            </p>
          </div>
        )}

        {/* Simples */}
        {!cargando && simples.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Simples
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {simples.map(obj => (
                <TarjetaSimple
                  key={obj.id}
                  objetivo={obj}
                  onToggle={() => toggleSimple(obj)}
                  onEliminar={() => setConfirmarEliminar(obj)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Avanzados */}
        {!cargando && avanzados.length > 0 && (
          <section>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Avanzados
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {avanzados.map(obj => (
                <TarjetaAvanzado
                  key={obj.id}
                  objetivo={obj}
                  onIncrementar={() => cambiarProgreso(obj, 1)}
                  onDecrementar={() => cambiarProgreso(obj, -1)}
                  onEliminar={() => setConfirmarEliminar(obj)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Modal: Crear ──────────────────────────────────────────────────────── */}
      {modalCrear && (
        <Overlay onClick={() => setModalCrear(false)}>
          <div onClick={e => e.stopPropagation()} style={estiloModal}>
            <h3 style={estiloTituloModal}>Nuevo objetivo</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={estiloLabel}>Tipo</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["simple", "avanzado"] as TipoObjetivo[]).map(t => (
                  <button key={t} onClick={() => setForm({ ...form, tipo: t })} style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer",
                    fontSize: 13, fontWeight: 600, border: "1.5px solid",
                    borderColor: form.tipo === t ? "#4F46E5" : "#E5E7EB",
                    background:  form.tipo === t ? "#EEF2FF" : "#fff",
                    color:       form.tipo === t ? "#4F46E5" : "#9CA3AF",
                  }}>
                    {t === "simple" ? "Simple" : "Avanzado"}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "6px 0 0" }}>
                {form.tipo === "simple"
                  ? "Meta sin seguimiento numérico. Márcala como completada cuando la logres."
                  : "Con progreso numérico, fecha límite y frecuencia de seguimiento."}
              </p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={estiloLabel}>Nombre</label>
              <input
                autoFocus
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder={form.tipo === "simple" ? "Ej: Aprender a cocinar" : "Ej: Leer 12 libros este año"}
                style={estiloInput}
                onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={estiloLabel}>
                Fecha límite
                {form.tipo === "simple" && (
                  <span style={{ fontSize: 10, fontWeight: 400, color: "#D1D5DB", marginLeft: 6 }}>opcional</span>
                )}
              </label>
              <input
                type="date"
                value={form.deadline}
                onChange={e => setForm({ ...form, deadline: e.target.value })}
                style={estiloInput}
                onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
              />
            </div>

            {form.tipo === "avanzado" && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={estiloLabel}>Meta</label>
                    <input
                      type="number"
                      value={form.meta}
                      onChange={e => setForm({ ...form, meta: e.target.value })}
                      placeholder="12"
                      style={estiloInput}
                      onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                      onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={estiloLabel}>Unidad</label>
                    <input
                      value={form.unidad}
                      onChange={e => setForm({ ...form, unidad: e.target.value })}
                      placeholder="libros, km, horas…"
                      style={estiloInput}
                      onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                      onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={estiloLabel}>Frecuencia de seguimiento</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {PERIODOS.map(p => (
                      <button key={p.value} onClick={() => setForm({ ...form, periodo: p.value })} style={{
                        flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                        fontSize: 12, fontWeight: 500, border: "1.5px solid",
                        borderColor: form.periodo === p.value ? "#4F46E5" : "#E5E7EB",
                        background:  form.periodo === p.value ? "#EEF2FF" : "#fff",
                        color:       form.periodo === p.value ? "#4F46E5" : "#9CA3AF",
                      }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {errorForm && <p style={{ fontSize: 13, color: "#EF4444", margin: "0 0 12px" }}>{errorForm}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => setModalCrear(false)} style={{ ...estiloBotonSecundario, flex: 1 }}>Cancelar</button>
              <button onClick={crearObjetivo} disabled={guardando} style={{ ...estiloBotonPrimario, flex: 2, opacity: guardando ? 0.7 : 1 }}>
                {guardando ? "Guardando…" : "Crear objetivo"}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ── Modal: Confirmar eliminar ──────────────────────────────────────────── */}
      {confirmarEliminar && (
        <Overlay onClick={() => setConfirmarEliminar(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...estiloModal, maxWidth: 380 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px" }}>Eliminar objetivo</h3>
            <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 24px", lineHeight: 1.5 }}>
              ¿Seguro que quieres eliminar <strong style={{ color: "#1A1A1A" }}>"{confirmarEliminar.nombre}"</strong>?
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmarEliminar(null)} style={estiloBotonSecundario}>Cancelar</button>
              <button onClick={() => eliminarObjetivo(confirmarEliminar.id)} style={{ ...estiloBotonPrimario, background: "#EF4444" }}>
                Eliminar
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Tarjeta Simple ───────────────────────────────────────────────────────────

function TarjetaSimple({ objetivo, onToggle, onEliminar }: {
  objetivo: Objetivo;
  onToggle: () => void;
  onEliminar: () => void;
}) {
  const [hover, setHover]       = useState(false);
  const [animando, setAnimando] = useState(false);
  const completado              = objetivo.progreso >= 100;
  const chip                    = chipDeadline(objetivo.deadline);

  function handleToggle() {
    if (animando) return;
    setAnimando(true);
    setTimeout(() => { onToggle(); setAnimando(false); }, 400);
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleToggle}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: animando ? "#F0FDF4" : "#FFFFFF",
        borderTop: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
        borderRight: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
        borderBottom: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
        borderLeft: `3px solid ${completado || animando ? "#059669" : hover ? "#4F46E5" : "#E5E7EB"}`,
        borderRadius: "0 12px 12px 0", padding: "12px 14px",
        cursor: "pointer", userSelect: "none", transition: "all 0.35s ease",
        opacity: animando ? 0.4 : completado ? 0.65 : 1,
        boxShadow: hover && !animando ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        border: `2px solid ${completado || animando ? "#059669" : "#D1D5DB"}`,
        background: completado || animando ? "#059669" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.3s ease",
      }}>
        {(completado || animando) && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 14, fontWeight: 500, display: "block",
          color: completado ? "#9CA3AF" : "#1A1A1A",
          textDecoration: completado ? "line-through" : "none",
          transition: "all 0.35s ease",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {objetivo.nombre}
        </span>
        {chip && !completado && (
          <span style={{ fontSize: 11, fontWeight: 500, marginTop: 2, display: "inline-block", color: chip.urgente ? "#D97706" : "#9CA3AF" }}>
            {chip.texto}
          </span>
        )}
      </div>

      <button
        onClick={e => { e.stopPropagation(); onEliminar(); }}
        style={{ background: "none", border: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, cursor: "pointer", color: hover ? "#6B7280" : "#D1D5DB", fontSize: 13, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.background = "#FEF2F2"; }}
        onMouseLeave={e => { e.currentTarget.style.color = hover ? "#6B7280" : "#D1D5DB"; e.currentTarget.style.borderColor = hover ? "#D1D5DB" : "#E5E7EB"; e.currentTarget.style.background = "none"; }}
      >✕</button>
    </div>
  );
}

// ─── Tarjeta Avanzado ─────────────────────────────────────────────────────────

function TarjetaAvanzado({ objetivo, onIncrementar, onDecrementar, onEliminar }: {
  objetivo: Objetivo;
  onIncrementar: () => void;
  onDecrementar: () => void;
  onEliminar: () => void;
}) {
  const [hover, setHover]           = useState(false);
  const [animKey, setAnimKey]       = useState<number | null>(null);
  const porcentaje                  = pct(objetivo);
  const completado                  = porcentaje >= 100;
  const chip                        = chipDeadline(objetivo.deadline);
  const periodoLabel                = PERIODOS.find(p => p.value === objetivo.periodo)?.label;

  function handleIncrementar() {
    onIncrementar();
    setAnimKey(Date.now()); // valor único por cada click
    setTimeout(() => setAnimKey(null), 600);
  }

  return (
    <>
      <style>{estiloAnimacion}</style>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: "#FFFFFF",
          borderTop: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`,
          borderRight: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`,
          borderBottom: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`,
          borderLeft: `3px solid ${completado ? "#059669" : hover ? "#4F46E5" : "#E5E7EB"}`,
          borderRadius: "0 14px 14px 0", padding: "16px 18px",
          transition: "all 0.2s ease",
          boxShadow: hover ? "0 4px 12px rgba(0,0,0,0.06)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 5px", color: completado ? "#059669" : "#1A1A1A" }}>
              {objetivo.nombre}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {chip && (
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99, background: chip.urgente ? "#FEF3C7" : "#F3F4F6", color: chip.urgente ? "#D97706" : "#6B7280" }}>
                  {chip.texto}
                </span>
              )}
              {periodoLabel && (
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99, background: "#EEF2FF", color: "#4F46E5" }}>
                  {periodoLabel}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12, alignItems: "center" }}>
            <button
              onClick={onDecrementar}
              style={{
                width: 32, height: 32, borderRadius: "50%", border: "2px solid #E5E7EB",
                background: "#F9FAFB", color: "#6B7280", fontSize: 18, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1, transition: "all 0.15s", flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.borderColor = "#FCA5A5"; e.currentTarget.style.color = "#DC2626"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#6B7280"; }}
            >−</button>

            {/* Botón + con animación flotante */}
            <div style={{ position: "relative" }}>
              {animKey && (
                <span key={animKey} style={{
                  position: "absolute", top: -6, left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: 12, fontWeight: 700, color: "#4F46E5",
                  pointerEvents: "none", whiteSpace: "nowrap",
                  animation: "flotarArriba 0.6s ease-out forwards",
                }}>
                  +1
                </span>
              )}
              <button
                onClick={handleIncrementar}
                style={{
                  width: 32, height: 32, borderRadius: "50%", border: "none",
                  background: "#4F46E5", color: "#fff", fontSize: 20, fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  lineHeight: 1, transition: "all 0.15s", flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(79,70,229,0.35)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#4338CA"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(79,70,229,0.5)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#4F46E5"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(79,70,229,0.35)"; }}
              >+</button>
            </div>

            <button
              onClick={onEliminar}
              style={{ background: "none", border: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, cursor: "pointer", color: hover ? "#6B7280" : "#D1D5DB", fontSize: 13, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.background = "#FEF2F2"; }}
              onMouseLeave={e => { e.currentTarget.style.color = hover ? "#6B7280" : "#D1D5DB"; e.currentTarget.style.borderColor = hover ? "#D1D5DB" : "#E5E7EB"; e.currentTarget.style.background = "none"; }}
            >✕</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 5, background: "#F3F4F6", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${porcentaje}%`, background: completado ? "#059669" : "#4F46E5", borderRadius: 99, transition: "width 0.4s ease" }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: completado ? "#059669" : "#4F46E5", minWidth: 80, textAlign: "right" }}>
            {objetivo.progreso}{objetivo.unidad ? ` ${objetivo.unidad}` : ""}
            {objetivo.meta ? <span style={{ fontWeight: 400, color: "#9CA3AF" }}> / {objetivo.meta}</span> : null}
          </span>
        </div>
      </div>
    </>
  );
}
// ─── Auxiliares ───────────────────────────────────────────────────────────────

function Overlay({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {children}
    </div>
  );
}

const estiloModal: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: "28px 24px 24px",
  width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", margin: "0 16px",
};

const estiloTituloModal: React.CSSProperties = {
  fontSize: 18, fontWeight: 700, color: "#1A1A1A", margin: "0 0 20px",
};

const estiloLabel: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em",
};

const estiloInput: React.CSSProperties = {
  width: "100%", padding: "11px 13px", border: "1.5px solid #E5E7EB",
  borderRadius: 10, fontSize: 14, color: "#1A1A1A", outline: "none",
  boxSizing: "border-box", background: "#fff", fontFamily: "inherit",
};

const estiloBotonPrimario: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 10, background: "#4F46E5",
  color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
};

const estiloBotonSecundario: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 10, background: "#F3F4F6",
  color: "#6B7280", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
};