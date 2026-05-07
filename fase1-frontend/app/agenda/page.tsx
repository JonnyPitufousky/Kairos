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
  const horaFin = finParte || null;
  return { fechaBase, horaInicio, horaFin };
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

// Devuelve el lunes de la semana de una fecha
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
      mapasSemana.set(key, {
        lunes,
        label: getLabelSemana(lunes),
        key,
        tareas: [],
      });
    }
    mapasSemana.get(key)!.tareas.push(tarea);
  }

  // Ordenar tareas dentro de cada semana por fecha
  for (const semana of mapasSemana.values()) {
    semana.tareas.sort((a, b) => {
      const fa = parseTarea(a).fechaBase.getTime();
      const fb = parseTarea(b).fechaBase.getTime();
      return fa - fb;
    });
  }

  const semanas = Array.from(mapasSemana.values()).sort((a, b) => a.lunes.getTime() - b.lunes.getTime());
  return { semanas, sinFecha };
}

export default function AgendaPage() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const { getToken } = useAuth();

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

  async function completarTarea(id: string, completado: boolean) {
    await fetch(`${BACKEND}/api/tareas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completado: !completado }),
    });
    cargarTareas();
  }

  const { semanas, sinFecha } = agruparPorSemana(tareas);

  return (
    <div style={{ background: "#FAFAF9", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header */}
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
              <SemanaGroup
                key={semana.key}
                semana={semana}
                onCompletar={completarTarea}
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
                    <AgendaTareaItem key={t.id} tarea={t} onCompletar={completarTarea} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
            <BotonNuevaTarea onTareaCreada={cargarTareas} />
    </div>
  );
}

// ── GRUPO SEMANA ──────────────────────────────────────────────
function SemanaGroup({ semana, onCompletar }: {
  semana: GrupoSemana;
  onCompletar: (id: string, completado: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const completadas = semana.tareas.filter(t => t.completado).length;
  const esPasada = semana.lunes < getLunes(new Date()) && semana.label !== "Esta semana";

  // Agrupar por día dentro de la semana
  const porDia: Map<string, Tarea[]> = new Map();
  for (const tarea of semana.tareas) {
    const { fechaBase } = parseTarea(tarea);
    const diaKey = new Date(fechaBase).toDateString();
    if (!porDia.has(diaKey)) porDia.set(diaKey, []);
    porDia.get(diaKey)!.push(tarea);
  }

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Cabecera semana */}
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
        <span style={{ fontSize: 11, color: "#D1D5DB", fontWeight: 600 }}>
          {completadas}/{semana.tareas.length}
        </span>
      </button>

      {/* Tareas agrupadas por día */}
      {abierto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {Array.from(porDia.entries()).map(([diaKey, tareasDia]) => {
            const fechaDia = new Date(diaKey);
            return (
              <div key={diaKey}>
                <p style={{
                  fontSize: 11, fontWeight: 600, color: "#9CA3AF",
                  textTransform: "capitalize", marginBottom: 8, letterSpacing: "0.02em"
                }}>
                  {getLabelDia(fechaDia)}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tareasDia.map(t => (
                    <AgendaTareaItem key={t.id} tarea={t} onCompletar={onCompletar} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TAREA ITEM AGENDA ─────────────────────────────────────────
function AgendaTareaItem({ tarea, onCompletar }: {
  tarea: Tarea;
  onCompletar: (id: string, completado: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  const [animando, setAnimando] = useState(false);
  const p = PRIORIDAD_CONFIG[tarea.prioridad];
  const vencida = isOverdue(tarea);
  const hora = formatHora(tarea);

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
        border: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
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

      {/* Hora + Prioridad */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {hora && (
          <span style={{ fontSize: 12, color: vencida ? "#EF4444" : "#9CA3AF", fontWeight: vencida ? 600 : 400 }}>
            {hora}
          </span>
        )}
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
          color: p.color, background: p.bg,
        }}>
          {p.label}
        </span>
      </div>
    </div>
  );
}