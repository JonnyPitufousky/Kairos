"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import BotonNuevaTarea from "../components/BotonNuevaTarea";

interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  completado: boolean;
  fecha_vencimiento: string | null;
  prioridad: "baja" | "media" | "alta";
  creadoEn: string;
}

const BACKEND = "http://localhost:3000";

const PRIORIDAD_CONFIG = {
  alta:  { label: "Alta",  color: "#EF4444", bg: "#FEF2F2", dot: "#EF4444" },
  media: { label: "Media", color: "#D97706", bg: "#FFFBEB", dot: "#D97706" },
  baja:  { label: "Baja",  color: "#059669", bg: "#F0FDF4", dot: "#059669" },
};

function parseTarea(tarea: Tarea): { fechaBase: Date; horaInicio: string | null; horaFin: string | null } {
  if (!tarea.fecha_vencimiento) return { fechaBase: new Date(), horaInicio: null, horaFin: null };
  const [fechaParte, finParte] = tarea.fecha_vencimiento.split("|");
  const fechaBase = new Date(fechaParte);
  const tieneHora = fechaBase.getHours() !== 0 || fechaBase.getMinutes() !== 0;
  const horaInicio = tieneHora
    ? `${String(fechaBase.getHours()).padStart(2, "0")}:${String(fechaBase.getMinutes()).padStart(2, "0")}`
    : null;
  return { fechaBase, horaInicio, horaFin: finParte || null };
}

function formatHora(tarea: Tarea): string | null {
  const { horaInicio, horaFin } = parseTarea(tarea);
  if (horaInicio && horaFin) return `${horaInicio}–${horaFin}`;
  if (horaInicio) return horaInicio;
  return null;
}

function isOverdue(tarea: Tarea): boolean {
  if (!tarea.fecha_vencimiento || tarea.completado) return false;
  const { fechaBase, horaFin } = parseTarea(tarea);
  const hoy = new Date();
  if (horaFin) {
    const [hh, mm] = horaFin.split(":").map(Number);
    const finDate = new Date(fechaBase);
    finDate.setHours(hh, mm, 0, 0);
    return finDate < hoy;
  }
  const tieneHora = fechaBase.getHours() !== 0 || fechaBase.getMinutes() !== 0;
  if (tieneHora) return fechaBase < hoy;
  const hoyDia = new Date(); hoyDia.setHours(0,0,0,0);
  const tareaDia = new Date(fechaBase); tareaDia.setHours(0,0,0,0);
  return tareaDia < hoyDia;
}

function getLunes(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getLabelSemana(lunes: Date): string {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const lunesHoy = getLunes(hoy);
  const diffSemanas = Math.round((lunes.getTime() - lunesHoy.getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (diffSemanas === 0) return "Esta semana";
  if (diffSemanas === 1) return "Semana que viene";
  if (diffSemanas === -1) return "Semana pasada";
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  const optsCorto: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${lunes.toLocaleDateString("es-ES", optsCorto)} – ${domingo.toLocaleDateString("es-ES", optsCorto)}`;
}

function getLabelDia(fecha: Date): string {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const d = new Date(fecha); d.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - hoy.getTime()) / (24*60*60*1000));
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

interface GrupoSemana {
  lunes: Date;
  label: string;
  key: string;
  tareas: Tarea[];
}

function agruparPorSemana(tareas: Tarea[]): { semanas: GrupoSemana[]; sinFecha: Tarea[] } {
  const conFecha = tareas.filter(t => t.fecha_vencimiento);
  const sinFecha = tareas.filter(t => !t.fecha_vencimiento);
  const mapasSemana: Map<string, GrupoSemana> = new Map();
  for (const tarea of conFecha) {
    const { fechaBase } = parseTarea(tarea);
    const lunes = getLunes(fechaBase);
    const key = lunes.toISOString();
    if (!mapasSemana.has(key)) {
      mapasSemana.set(key, { lunes, label: getLabelSemana(lunes), key, tareas: [] });
    }
    mapasSemana.get(key)!.tareas.push(tarea);
  }
  for (const semana of mapasSemana.values()) {
    semana.tareas.sort((a, b) => parseTarea(a).fechaBase.getTime() - parseTarea(b).fechaBase.getTime());
  }
  const semanas = Array.from(mapasSemana.values()).sort((a, b) => a.lunes.getTime() - b.lunes.getTime());
  return { semanas, sinFecha };
}

export default function AgendaPage() {
  const [tareas, setTareas]                       = useState<Tarea[]>([]);
  const [cargando, setCargando]                   = useState(true);
  const [editarTarea, setEditarTarea]             = useState<Tarea | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState<Tarea | null>(null);
  const { getToken } = useAuth();

  // Form states para editar
  const [formTitulo, setFormTitulo]         = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formPrioridad, setFormPrioridad]   = useState<"baja"|"media"|"alta">("media");
  const [formFecha, setFormFecha]           = useState("");
  const [formHoraInicio, setFormHoraInicio] = useState("");
  const [formHoraFin, setFormHoraFin]       = useState("");

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

  useEffect(() => { cargarTareas(); }, []);

  async function cargarTareas() {
    setCargando(true);
    const res = await apiFetch(`${BACKEND}/api/tareas`);
    const data = await res.json();
    setTareas(Array.isArray(data) ? data : []);
    setCargando(false);
  }

  // Optimistic update — no recarga toda la página
  async function completarTarea(id: string, completado: boolean) {
    setTareas(prev => prev.map(t => t.id === id ? { ...t, completado: !completado } : t));
    await apiFetch(`${BACKEND}/api/tareas/${id}`, {
      method: "PUT",
      body: JSON.stringify({ completado: !completado }),
    });
  }

  async function eliminarTarea(id: string) {
    await apiFetch(`${BACKEND}/api/tareas/${id}`, { method: "DELETE" });
    setConfirmarEliminar(null);
    setTareas(prev => prev.filter(t => t.id !== id));
  }

  function abrirEditar(tarea: Tarea) {
    setEditarTarea(tarea);
    setFormTitulo(tarea.titulo);
    setFormDescripcion(tarea.descripcion || "");
    setFormPrioridad(tarea.prioridad);
    if (tarea.fecha_vencimiento) {
      const { horaInicio, horaFin } = parseTarea(tarea);
      setFormFecha(tarea.fecha_vencimiento.split("T")[0]);
      setFormHoraInicio(horaInicio || "");
      setFormHoraFin(horaFin || "");
    } else {
      setFormFecha(""); setFormHoraInicio(""); setFormHoraFin("");
    }
  }

  function buildFechaVencimiento(fecha: string, horaInicio: string, horaFin: string): string {
    if (!fecha) return "";
    if (horaInicio && horaFin) return `${fecha}T${horaInicio}:00|${horaFin}`;
    if (horaInicio) return `${fecha}T${horaInicio}:00`;
    return `${fecha}T00:00:00`;
  }

  async function actualizarTarea(e: React.FormEvent) {
    e.preventDefault();
    if (!editarTarea || !formTitulo.trim() || !formFecha) return;
    const fecha_vencimiento = buildFechaVencimiento(formFecha, formHoraInicio, formHoraFin);
    await apiFetch(`${BACKEND}/api/tareas/${editarTarea.id}`, {
      method: "PUT",
      body: JSON.stringify({ titulo: formTitulo, descripcion: formDescripcion || null, prioridad: formPrioridad, fecha_vencimiento }),
    });
    setEditarTarea(null);
    cargarTareas();
  }

  const { semanas, sinFecha } = agruparPorSemana(tareas);

  return (
    <div style={{ background: "#FAFAF9", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Vista cronológica</p>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1A1A1A", margin: 0, letterSpacing: "-0.5px" }}>Agenda</h1>
        </div>

        {cargando ? (
          <p style={{ textAlign: "center", color: "#9CA3AF", padding: "40px 0", fontSize: 14 }}>Cargando...</p>
        ) : tareas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>✦</p>
            <p style={{ color: "#6B7280", fontSize: 15, fontWeight: 500 }}>Sin tareas</p>
            <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 4 }}>Las tareas que añadas aparecerán aquí</p>
          </div>
        ) : (
          <>
            {semanas.map(semana => (
              <SemanaGroup key={semana.key} semana={semana}
                onCompletar={completarTarea}
                onEditar={abrirEditar}
                onEliminar={setConfirmarEliminar}
              />
            ))}
            {sinFecha.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF" }}>Sin fecha</span>
                  <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                  <span style={{ fontSize: 11, color: "#D1D5DB", fontWeight: 600 }}>{sinFecha.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sinFecha.map(t => (
                    <AgendaTareaItem key={t.id} tarea={t}
                      onCompletar={completarTarea}
                      onEditar={abrirEditar}
                      onEliminar={setConfirmarEliminar}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal editar */}
      {editarTarea && (
        <ModalTarea
          titulo="Editar tarea" boton="Guardar cambios"
          formTitulo={formTitulo} setFormTitulo={setFormTitulo}
          formDescripcion={formDescripcion} setFormDescripcion={setFormDescripcion}
          formPrioridad={formPrioridad} setFormPrioridad={setFormPrioridad}
          formFecha={formFecha} setFormFecha={setFormFecha}
          formHoraInicio={formHoraInicio} setFormHoraInicio={setFormHoraInicio}
          formHoraFin={formHoraFin} setFormHoraFin={setFormHoraFin}
          onSubmit={actualizarTarea}
          onCerrar={() => setEditarTarea(null)}
        />
      )}

      {/* Modal eliminar */}
      {confirmarEliminar && (
        <div onClick={() => setConfirmarEliminar(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#FFFFFF", borderRadius: 14, padding: "28px 24px", width: "100%", maxWidth: 380, margin: "0 16px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px" }}>Eliminar tarea</h3>
            <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 24px", lineHeight: 1.5 }}>
              ¿Seguro que quieres eliminar <strong style={{ color: "#1A1A1A" }}>"{confirmarEliminar.titulo}"</strong>?
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmarEliminar(null)} style={{ background: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={() => eliminarTarea(confirmarEliminar.id)} style={{ background: "#EF4444", color: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <BotonNuevaTarea onTareaCreada={cargarTareas} />
    </div>
  );
}

// ── GRUPO SEMANA ──────────────────────────────────────────────────────────────

function SemanaGroup({ semana, onCompletar, onEditar, onEliminar }: {
  semana: GrupoSemana;
  onCompletar: (id: string, completado: boolean) => void;
  onEditar: (tarea: Tarea) => void;
  onEliminar: (tarea: Tarea) => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const completadas = semana.tareas.filter(t => t.completado).length;
  const esPasada = semana.lunes < getLunes(new Date()) && semana.label !== "Esta semana";

  const porDia: Map<string, Tarea[]> = new Map();
  for (const tarea of semana.tareas) {
    const { fechaBase } = parseTarea(tarea);
    const diaKey = new Date(fechaBase).toDateString();
    if (!porDia.has(diaKey)) porDia.set(diaKey, []);
    porDia.get(diaKey)!.push(tarea);
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <button
        onClick={() => setAbierto(!abierto)}
        style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: abierto ? 14 : 0, background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: abierto ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: esPasada ? "#9CA3AF" : "#1A1A1A" }}>{semana.label}</span>
        <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
        <span style={{ fontSize: 11, color: "#D1D5DB", fontWeight: 600 }}>{completadas}/{semana.tareas.length}</span>
      </button>

      {abierto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {Array.from(porDia.entries()).map(([diaKey, tareasDia]) => (
            <div key={diaKey}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "capitalize", marginBottom: 8, letterSpacing: "0.02em" }}>
                {getLabelDia(new Date(diaKey))}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tareasDia.map(t => (
                  <AgendaTareaItem key={t.id} tarea={t}
                    onCompletar={onCompletar}
                    onEditar={onEditar}
                    onEliminar={onEliminar}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TAREA ITEM ────────────────────────────────────────────────────────────────

function AgendaTareaItem({ tarea, onCompletar, onEditar, onEliminar }: {
  tarea: Tarea;
  onCompletar: (id: string, completado: boolean) => void;
  onEditar: (tarea: Tarea) => void;
  onEliminar: (tarea: Tarea) => void;
}) {
  const [hover, setHover]       = useState(false);
  const [animando, setAnimando] = useState(false);
  const p     = PRIORIDAD_CONFIG[tarea.prioridad];
  const vencida = isOverdue(tarea);
  const hora  = formatHora(tarea);

  function handleCompletar() {
    if (animando) return;
    setAnimando(true);
    setTimeout(() => { onCompletar(tarea.id, tarea.completado); setAnimando(false); }, 500);
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleCompletar}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: animando ? "#F0FDF4" : "#FFFFFF",
        borderTop: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
        borderRight: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
        borderBottom: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
        borderLeft: `3px solid ${animando ? "#059669" : hover ? p.dot : "#E5E7EB"}`,
        borderRadius: "0 12px 12px 0", padding: "11px 14px",
        cursor: "pointer", userSelect: "none",
        transition: "all 0.4s ease",
        opacity: animando ? 0.3 : tarea.completado ? 0.5 : 1,
        transform: animando ? "scale(0.97)" : "scale(1)",
        boxShadow: hover && !animando ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
      }}
    >
      {/* Checkbox */}
      <div style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
        border: `2px solid ${tarea.completado || animando ? "#059669" : p.dot}`,
        background: tarea.completado || animando ? "#059669" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.3s ease",
      }}>
        {(tarea.completado || animando) && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 14, fontWeight: 500, display: "block",
          color: tarea.completado || animando ? "#9CA3AF" : "#1A1A1A",
          textDecoration: tarea.completado || animando ? "line-through" : "none",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          transition: "all 0.4s ease",
        }}>
          {tarea.titulo}
        </span>
        {tarea.descripcion && (
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {tarea.descripcion}
          </p>
        )}
      </div>

      {/* Hora + prioridad */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {hora && (
          <span style={{ fontSize: 12, color: vencida ? "#EF4444" : "#9CA3AF", fontWeight: vencida ? 600 : 400 }}>
            {hora}
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, color: p.color, background: p.bg }}>
          {p.label}
        </span>
      </div>

      {/* Botones editar / eliminar */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); onEditar(tarea); }}
          style={{ background: "none", border: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, cursor: "pointer", color: hover ? "#6B7280" : "#D1D5DB", fontSize: 13, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#6366F1"; e.currentTarget.style.borderColor = "#C7D2FE"; e.currentTarget.style.background = "#EEF2FF"; }}
          onMouseLeave={e => { e.currentTarget.style.color = hover ? "#6B7280" : "#D1D5DB"; e.currentTarget.style.borderColor = hover ? "#D1D5DB" : "#E5E7EB"; e.currentTarget.style.background = "none"; }}
        >
          Editar
        </button>
        <button
          onClick={e => { e.stopPropagation(); onEliminar(tarea); }}
          style={{ background: "none", border: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, cursor: "pointer", color: hover ? "#6B7280" : "#D1D5DB", fontSize: 13, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.background = "#FEF2F2"; }}
          onMouseLeave={e => { e.currentTarget.style.color = hover ? "#6B7280" : "#D1D5DB"; e.currentTarget.style.borderColor = hover ? "#D1D5DB" : "#E5E7EB"; e.currentTarget.style.background = "none"; }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── MODAL TAREA ───────────────────────────────────────────────────────────────

function ModalTarea({ titulo, boton, formTitulo, setFormTitulo, formDescripcion, setFormDescripcion, formPrioridad, setFormPrioridad, formFecha, setFormFecha, formHoraInicio, setFormHoraInicio, formHoraFin, setFormHoraFin, onSubmit, onCerrar }: {
  titulo: string; boton: string;
  formTitulo: string; setFormTitulo: (v: string) => void;
  formDescripcion: string; setFormDescripcion: (v: string) => void;
  formPrioridad: "baja"|"media"|"alta"; setFormPrioridad: (v: "baja"|"media"|"alta") => void;
  formFecha: string; setFormFecha: (v: string) => void;
  formHoraInicio: string; setFormHoraInicio: (v: string) => void;
  formHoraFin: string; setFormHoraFin: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCerrar: () => void;
}) {
  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FFFFFF", borderRadius: 14, padding: "28px 24px", width: "100%", maxWidth: 440, margin: "0 16px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", margin: "0 0 20px" }}>{titulo}</h3>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Título *</label>
            <input value={formTitulo} onChange={e => setFormTitulo(e.target.value)} placeholder="¿Qué necesitas hacer?" autoFocus required
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", fontSize: 15, color: "#1A1A1A", outline: "none", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Descripción</label>
            <textarea value={formDescripcion} onChange={e => setFormDescripcion(e.target.value)} placeholder="Notas adicionales..." rows={2}
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#1A1A1A", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fecha límite *</label>
            <input type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)} required
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#1A1A1A", outline: "none", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Periodo horario
              <span style={{ fontSize: 10, fontWeight: 400, color: "#D1D5DB", marginLeft: 6 }}>opcional</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="time" value={formHoraInicio} onChange={e => setFormHoraInicio(e.target.value)}
                style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "9px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
              />
              <span style={{ fontSize: 13, color: "#9CA3AF", flexShrink: 0 }}>→</span>
              <input type="time" value={formHoraFin} onChange={e => setFormHoraFin(e.target.value)}
                style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "9px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                onBlur={e  => (e.currentTarget.style.borderColor = "#E5E7EB")}
              />
            </div>
            {formHoraInicio && !formHoraFin && (
              <p style={{ fontSize: 11, color: "#D97706", marginTop: 5 }}>Añade hora de fin para activar la detección automática</p>
            )}
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prioridad</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["baja","media","alta"] as const).map(p => (
                <button key={p} type="button" onClick={() => setFormPrioridad(p)}
                  style={{ flex: 1, padding: "9px 0", border: "1.5px solid", borderColor: formPrioridad===p ? PRIORIDAD_CONFIG[p].color : "#E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: formPrioridad===p ? PRIORIDAD_CONFIG[p].color : "#9CA3AF", background: formPrioridad===p ? PRIORIDAD_CONFIG[p].bg : "#FFFFFF", transition: "all 0.12s" }}>
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