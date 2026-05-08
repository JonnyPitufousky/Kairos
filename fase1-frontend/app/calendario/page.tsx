"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  startOfWeek, format, addWeeks, addMonths, addDays,
  startOfMonth, isSameDay, isSameMonth, isToday, getDay, getYear,
} from "date-fns";
import { es } from "date-fns/locale";

const BACKEND   = "http://localhost:3000";
const HORA_ALTO = 56;
const HORAS     = Array.from({ length: 24 }, (_, i) => i);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Tarea {
  id: string; titulo: string; completado: boolean;
  fecha_vencimiento: string | null; prioridad: "baja" | "media" | "alta";
}
interface Rutina {
  id: string; nombre: string; diaSemana: number;
  horaInicio: string; horaFin: string; color: string | null;
}
interface Evento {
  id: string; titulo: string; descripcion: string | null;
  fecha: string; horaInicio: string | null; horaFin: string | null;
}
type VistaType = "dia" | "semana" | "mes" | "ano";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mins0(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}
function parseTarea(t: Tarea): { fecha: Date; horaInicio: string | null; horaFin: string | null } | null {
  if (!t.fecha_vencimiento) return null;
  const [fp, fin] = t.fecha_vencimiento.split("|");
  const fecha = new Date(fp);
  const tieneHora = fecha.getHours() !== 0 || fecha.getMinutes() !== 0;
  const horaInicio = tieneHora ? `${String(fecha.getHours()).padStart(2,"0")}:${String(fecha.getMinutes()).padStart(2,"0")}` : null;
  return { fecha, horaInicio, horaFin: fin || null };
}
function diaIdx(date: Date): number { return (getDay(date) + 6) % 7; }
function horaFallback(h: string): string {
  return `${String(Math.min(23, parseInt(h.split(":")[0]) + 1)).padStart(2,"0")}:00`;
}
const PCOLOR: Record<string, string> = { alta: "#EF4444", media: "#D97706", baja: "#059669" };
const COLORES_RUTINA = ["#6366F1","#059669","#D97706","#EF4444","#8B5CF6","#0EA5E9","#EC4899","#14B8A6"];
const DIAS_LABELS    = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CalendarioPage() {
  const { getToken } = useAuth();
  const [vista, setVista]       = useState<VistaType>("semana");
  const [fechaRef, setFechaRef] = useState(new Date());
  const [tareas, setTareas]     = useState<Tarea[]>([]);
  const [rutinas, setRutinas]   = useState<Rutina[]>([]);
  const [eventos, setEventos]   = useState<Evento[]>([]);
  const [modalEvento, setModalEvento] = useState(false);
  const [modalRutina, setModalRutina] = useState(false);
  const [modalTarea, setModalTarea]   = useState(false);
  const [slot, setSlot] = useState<{ fecha: Date; hora: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function apiFetch(url: string, options: RequestInit = {}) {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  }

  async function cargarDatos() {
    try {
      const [rT, rR, rE] = await Promise.all([
        apiFetch(`${BACKEND}/api/tareas`), apiFetch(`${BACKEND}/api/rutinas`), apiFetch(`${BACKEND}/api/eventos`),
      ]);
      const [dT, dR, dE] = await Promise.all([rT.json(), rR.json(), rE.json()]);
      setTareas(Array.isArray(dT) ? dT : []);
      setRutinas(Array.isArray(dR) ? dR : []);
      setEventos(Array.isArray(dE) ? dE : []);
    } catch { /* silencioso */ }
  }

  useEffect(() => { cargarDatos(); }, []);

  useEffect(() => {
    if (scrollRef.current && (vista === "semana" || vista === "dia"))
      scrollRef.current.scrollTop = 7 * HORA_ALTO;
  }, [vista]);

  function navAtras() {
    setFechaRef(d =>
      vista === "dia"    ? addDays(d, -1)    :
      vista === "semana" ? addWeeks(d, -1)   :
      vista === "mes"    ? addMonths(d, -1)  :
      new Date(getYear(d) - 1, 0, 1)
    );
  }
  function navAdelante() {
    setFechaRef(d =>
      vista === "dia"    ? addDays(d, 1)    :
      vista === "semana" ? addWeeks(d, 1)   :
      vista === "mes"    ? addMonths(d, 1)  :
      new Date(getYear(d) + 1, 0, 1)
    );
  }
  function tituloNav(): string {
    if (vista === "dia")    return format(fechaRef, "EEEE, d 'de' MMMM yyyy", { locale: es });
    if (vista === "semana") {
      const ini = startOfWeek(fechaRef, { weekStartsOn: 1 });
      return `${format(ini, "d MMM", { locale: es })} – ${format(addDays(ini, 6), "d MMM yyyy", { locale: es })}`;
    }
    if (vista === "mes") return format(fechaRef, "MMMM yyyy", { locale: es });
    return String(getYear(fechaRef));
  }
  function abrirSlot(fecha: Date, hora: string) { setSlot({ fecha, hora }); setModalEvento(true); }

  return (
    <div style={{ background: "#FAFAF9", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #E5E7EB", background: "#FAFAF9", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BtnNav onClick={navAtras}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </BtnNav>
          <BtnNav onClick={() => setFechaRef(new Date())} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}>Hoy</BtnNav>
          <BtnNav onClick={navAdelante}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </BtnNav>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginLeft: 10, textTransform: "capitalize" }}>{tituloNav()}</span>
        </div>
        <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 8, padding: 3, gap: 2 }}>
          {(["dia","semana","mes","ano"] as VistaType[]).map(v => (
            <button key={v} onClick={() => setVista(v)} style={{
              padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 500, transition: "all 0.15s",
              background: vista === v ? "#fff" : "transparent",
              color: vista === v ? "#1A1A1A" : "#6B7280",
              boxShadow: vista === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}>
              {v === "dia" ? "Día" : v === "semana" ? "Semana" : v === "mes" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
      </div>

      {/* Vistas */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {vista === "semana" && <VistaSemana fechaRef={fechaRef} tareas={tareas} rutinas={rutinas} eventos={eventos} scrollRef={scrollRef} onClickSlot={abrirSlot} onClickDia={d => { setFechaRef(d); setVista("dia"); }} />}
        {vista === "dia"    && <VistaDia    fecha={fechaRef}    tareas={tareas} rutinas={rutinas} eventos={eventos} scrollRef={scrollRef} onClickSlot={abrirSlot} />}
        {vista === "mes"    && <VistaMes    fechaRef={fechaRef} tareas={tareas} rutinas={rutinas} eventos={eventos} onClickDia={d => { setFechaRef(d); setVista("dia"); }} />}
        {vista === "ano"    && <VistaAno    fechaRef={fechaRef} tareas={tareas} rutinas={rutinas} eventos={eventos} onClickMes={d => { setFechaRef(d); setVista("mes"); }} />}
      </div>

      <SpeedDial
        onNuevaTarea={() => { setSlot(null); setModalTarea(true); }}
        onNuevaRutina={() => { setSlot(null); setModalRutina(true); }}
        onNuevoEvento={() => { setSlot(null); setModalEvento(true); }}
      />

      {modalEvento && <ModalEvento slotInicial={slot} onCerrar={() => { setModalEvento(false); setSlot(null); }} onGuardado={() => { setModalEvento(false); setSlot(null); cargarDatos(); }} apiFetch={apiFetch} />}
      {modalRutina && <ModalRutina slotInicial={slot} onCerrar={() => { setModalRutina(false); setSlot(null); }} onGuardado={() => { setModalRutina(false); setSlot(null); cargarDatos(); }} apiFetch={apiFetch} />}
      {modalTarea  && <ModalTareaSimple slotInicial={slot} onCerrar={() => { setModalTarea(false); setSlot(null); }} onGuardado={() => { setModalTarea(false); setSlot(null); cargarDatos(); }} apiFetch={apiFetch} />}
    </div>
  );
}

// ─── Vista Semana ─────────────────────────────────────────────────────────────

function VistaSemana({ fechaRef, tareas, rutinas, eventos, scrollRef, onClickSlot, onClickDia }: {
  fechaRef: Date; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[];
  scrollRef: React.RefObject<HTMLDivElement>;
  onClickSlot: (f: Date, h: string) => void;
  onClickDia:  (f: Date) => void;
}) {
  const ini  = startOfWeek(fechaRef, { weekStartsOn: 1 });
  const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header días */}
      <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid #E5E7EB" }}>
        <div style={{ width: 52, flexShrink: 0 }} />
        {dias.map((dia, i) => {
          const hoy = isToday(dia);
          return (
            <div key={i} onClick={() => onClickDia(dia)} style={{ flex: 1, textAlign: "center", padding: "6px 0", cursor: "pointer", borderLeft: "1px solid #F3F4F6" }}>
              <p style={{ fontSize: 10, color: "#9CA3AF", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {format(dia, "EEE", { locale: es })}
              </p>
              <div style={{ width: 30, height: 30, borderRadius: "50%", margin: "0 auto", background: hoy ? "#4F46E5" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 14, fontWeight: hoy ? 700 : 400, color: hoy ? "#fff" : "#1A1A1A" }}>{format(dia, "d")}</span>
              </div>
            </div>
          );
        })}
      </div>
      <ZonaSinHora diasSemana={dias} tareas={tareas} />
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex" }}>
          <div style={{ width: 52, flexShrink: 0 }}>
            {HORAS.map(h => (
              <div key={h} style={{ height: HORA_ALTO, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 6, paddingTop: 3 }}>
                {h > 0 && <span style={{ fontSize: 10, color: "#9CA3AF" }}>{String(h).padStart(2,"0")}:00</span>}
              </div>
            ))}
          </div>
          {dias.map((dia, i) => (
            <ColumnaDia key={i} dia={dia} diaIdx={diaIdx(dia)} tareas={tareas} rutinas={rutinas} eventos={eventos} scrollRef={scrollRef} onClickSlot={onClickSlot} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Columna día ──────────────────────────────────────────────────────────────

function ColumnaDia({ dia, diaIdx: dIdx, tareas, rutinas, eventos, scrollRef, onClickSlot }: {
  dia: Date; diaIdx: number; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[];
  scrollRef: React.RefObject<HTMLDivElement>;
  onClickSlot: (f: Date, h: string) => void;
}) {
  const rutinasDia = rutinas.filter(r => r.diaSemana === dIdx);
  const tareasDia  = tareas.filter(t => { const p = parseTarea(t); return p && isSameDay(p.fecha, dia) && p.horaInicio; });
  const eventosDia = eventos.filter(e => e.horaInicio && isSameDay(new Date(e.fecha), dia));

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const h = Math.floor(y / HORA_ALTO);
    const m = Math.floor(((y / HORA_ALTO) - h) * 60 / 15) * 15;
    onClickSlot(dia, `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  }

  return (
    <div style={{ flex: 1, position: "relative", borderLeft: "1px solid #F3F4F6" }} onClick={handleClick}>
      {HORAS.map(h => <div key={h} style={{ height: HORA_ALTO, borderTop: "1px solid #F3F4F6" }} />)}
      {rutinasDia.map(r => <BloqueHorario key={`r-${r.id}`} titulo={r.nombre} horaInicio={r.horaInicio} horaFin={r.horaFin} color={r.color || "#6366F1"} tipo="rutina" />)}
      {tareasDia.map(t => { const p = parseTarea(t)!; return <BloqueHorario key={`t-${t.id}`} titulo={t.titulo} horaInicio={p.horaInicio!} horaFin={p.horaFin || horaFallback(p.horaInicio!)} color={PCOLOR[t.prioridad]} tipo="tarea" completado={t.completado} />; })}
      {eventosDia.map(ev => <BloqueHorario key={`e-${ev.id}`} titulo={ev.titulo} horaInicio={ev.horaInicio!} horaFin={ev.horaFin || horaFallback(ev.horaInicio!)} color="#6366F1" tipo="evento" />)}
      {isToday(dia) && <LineaHoraActual />}
    </div>
  );
}

// ─── Vista Día ────────────────────────────────────────────────────────────────

function VistaDia({ fecha, tareas, rutinas, eventos, scrollRef, onClickSlot }: {
  fecha: Date; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[];
  scrollRef: React.RefObject<HTMLDivElement>;
  onClickSlot: (f: Date, h: string) => void;
}) {
  const idx = diaIdx(fecha);
  const rutinasDia = rutinas.filter(r => r.diaSemana === idx);
  const tareasDia  = tareas.filter(t => { const p = parseTarea(t); return p && isSameDay(p.fecha, fecha) && p.horaInicio; });
  const sinHora    = tareas.filter(t => { const p = parseTarea(t); return p && isSameDay(p.fecha, fecha) && !p.horaInicio; });
  const eventosDia = eventos.filter(e => e.horaInicio && isSameDay(new Date(e.fecha), fecha));

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const h = Math.floor(y / HORA_ALTO);
    const m = Math.floor(((y / HORA_ALTO) - h) * 60 / 15) * 15;
    onClickSlot(fecha, `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {sinHora.length > 0 && (
        <div style={{ flexShrink: 0, display: "flex", borderBottom: "1px solid #E5E7EB", padding: "6px 0" }}>
          <div style={{ width: 52, flexShrink: 0, textAlign: "right", paddingRight: 6 }}>
            <span style={{ fontSize: 9, color: "#9CA3AF" }}>sin hora</span>
          </div>
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4, paddingRight: 16 }}>
            {sinHora.map(t => (
              <div key={t.id} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: `${PCOLOR[t.prioridad]}18`, color: PCOLOR[t.prioridad], borderLeft: `2px solid ${PCOLOR[t.prioridad]}`, display: "flex", gap: 6, alignItems: "center" }}>
                {t.titulo} <span style={{ fontSize: 10, opacity: 0.6 }}>Sin hora establecida</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", maxWidth: 680, margin: "0 auto" }}>
          <div style={{ width: 52, flexShrink: 0 }}>
            {HORAS.map(h => (
              <div key={h} style={{ height: HORA_ALTO, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 6, paddingTop: 3 }}>
                {h > 0 && <span style={{ fontSize: 10, color: "#9CA3AF" }}>{String(h).padStart(2,"0")}:00</span>}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative", borderLeft: "1px solid #F3F4F6" }} onClick={handleClick}>
            {HORAS.map(h => <div key={h} style={{ height: HORA_ALTO, borderTop: "1px solid #F3F4F6" }} />)}
            {rutinasDia.map(r => <BloqueHorario key={`r-${r.id}`} titulo={r.nombre} horaInicio={r.horaInicio} horaFin={r.horaFin} color={r.color || "#6366F1"} tipo="rutina" />)}
            {tareasDia.map(t => { const p = parseTarea(t)!; return <BloqueHorario key={`t-${t.id}`} titulo={t.titulo} horaInicio={p.horaInicio!} horaFin={p.horaFin || horaFallback(p.horaInicio!)} color={PCOLOR[t.prioridad]} tipo="tarea" completado={t.completado} />; })}
            {eventosDia.map(ev => <BloqueHorario key={`e-${ev.id}`} titulo={ev.titulo} horaInicio={ev.horaInicio!} horaFin={ev.horaFin || horaFallback(ev.horaInicio!)} color="#6366F1" tipo="evento" />)}
            {isToday(fecha) && <LineaHoraActual />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Vista Mes ────────────────────────────────────────────────────────────────

function VistaMes({ fechaRef, tareas, rutinas, eventos, onClickDia }: {
  fechaRef: Date; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[];
  onClickDia: (f: Date) => void;
}) {
  const iniGrid = startOfWeek(startOfMonth(fechaRef), { weekStartsOn: 1 });
  const dias    = Array.from({ length: 42 }, (_, i) => addDays(iniGrid, i));

  function items(dia: Date) {
    const idx = diaIdx(dia);
    return {
      rutinas: rutinas.some(r => r.diaSemana === idx),
      tareas:  tareas.some(t => { const p = parseTarea(t); return p && isSameDay(p.fecha, dia); }),
      eventos: eventos.some(e => isSameDay(new Date(e.fecha), dia)),
    };
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 24px 32px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "#E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        {dias.map((dia, i) => {
          const esteMes = isSameMonth(dia, fechaRef);
          const hoy     = isToday(dia);
          const it      = items(dia);
          return (
            <div key={i} onClick={() => onClickDia(dia)} style={{ background: hoy ? "#EEF2FF" : "#FAFAF9", padding: "8px", minHeight: 76, cursor: "pointer", opacity: esteMes ? 1 : 0.3, transition: "background 0.12s" }}
              onMouseEnter={e => (e.currentTarget.style.background = hoy ? "#E0E7FF" : "#F3F4F6")}
              onMouseLeave={e => (e.currentTarget.style.background = hoy ? "#EEF2FF" : "#FAFAF9")}
            >
              <div style={{ width: 26, height: 26, borderRadius: "50%", marginBottom: 5, background: hoy ? "#4F46E5" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 13, fontWeight: hoy ? 700 : 400, color: hoy ? "#fff" : "#1A1A1A" }}>{format(dia, "d")}</span>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {it.rutinas && <Punto color="#6366F1" />}
                {it.tareas  && <Punto color="#D97706" />}
                {it.eventos && <Punto color="#059669" />}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14 }}>
        {[{color:"#6366F1",label:"Rutinas"},{color:"#D97706",label:"Tareas"},{color:"#059669",label:"Eventos"}].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Punto color={l.color} /><span style={{ fontSize: 12, color: "#6B7280" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Vista Año ────────────────────────────────────────────────────────────────

function VistaAno({ fechaRef, tareas, rutinas, eventos, onClickMes }: {
  fechaRef: Date; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[];
  onClickMes: (f: Date) => void;
}) {
  const year  = getYear(fechaRef);
  const meses = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));

  function tieneItems(dia: Date): boolean {
    const idx = diaIdx(dia);
    if (rutinas.some(r => r.diaSemana === idx)) return true;
    if (tareas.some(t => { const p = parseTarea(t); return p && isSameDay(p.fecha, dia); })) return true;
    if (eventos.some(e => isSameDay(new Date(e.fecha), dia))) return true;
    return false;
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px 40px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, maxWidth: 880, margin: "0 auto" }}>
        {meses.map((mes, mi) => {
          const iniGrid = startOfWeek(startOfMonth(mes), { weekStartsOn: 1 });
          const dias    = Array.from({ length: 35 }, (_, j) => addDays(iniGrid, j));
          return (
            <div key={mi} onClick={() => onClickMes(mes)} style={{ background: "#fff", borderRadius: 12, padding: "12px 10px", border: "1px solid #E5E7EB", cursor: "pointer", transition: "box-shadow 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
            >
              <p style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px", textTransform: "capitalize" }}>
                {format(mes, "MMMM", { locale: es })}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {["L","M","X","J","V","S","D"].map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: 8, color: "#9CA3AF", paddingBottom: 2 }}>{d}</div>
                ))}
                {dias.map((dia, j) => {
                  const esteMes = isSameMonth(dia, mes);
                  const hoy     = isToday(dia);
                  const tiene   = esteMes && tieneItems(dia);
                  return (
                    <div key={j} style={{ textAlign: "center", position: "relative", padding: "1px 0" }}>
                      <span style={{ fontSize: 9, display: "inline-flex", width: 14, height: 14, borderRadius: "50%", alignItems: "center", justifyContent: "center", background: hoy ? "#4F46E5" : "transparent", color: hoy ? "#fff" : esteMes ? "#1A1A1A" : "#D1D5DB", fontWeight: hoy ? 700 : 400 }}>
                        {esteMes ? format(dia, "d") : ""}
                      </span>
                      {tiene && !hoy && <span style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: "#4F46E5", display: "block" }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Componentes pequeños ─────────────────────────────────────────────────────

function BloqueHorario({ titulo, horaInicio, horaFin, color, tipo, completado }: {
  titulo: string; horaInicio: string; horaFin: string;
  color: string; tipo: "rutina"|"tarea"|"evento"; completado?: boolean;
}) {
  const top    = (mins0(horaInicio) / 60) * HORA_ALTO;
  const height = Math.max(((mins0(horaFin) - mins0(horaInicio)) / 60) * HORA_ALTO, 18);
  return (
    <div onClick={e => e.stopPropagation()} style={{ position: "absolute", left: 2, right: 2, top, height, background: `${color}1A`, borderLeft: `3px solid ${color}`, borderRadius: "0 5px 5px 0", padding: "2px 5px", overflow: "hidden", cursor: "pointer", zIndex: 1, transition: "filter 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.filter = "brightness(0.93)")}
      onMouseLeave={e => (e.currentTarget.style.filter = "none")}
    >
      <p style={{ fontSize: 11, fontWeight: 600, color, margin: 0, lineHeight: 1.3, textDecoration: completado ? "line-through" : "none", opacity: completado ? 0.5 : 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {titulo}
      </p>
      {height > 28 && <p style={{ fontSize: 10, color, opacity: 0.65, margin: "1px 0 0" }}>{horaInicio} – {horaFin}</p>}
    </div>
  );
}

function ZonaSinHora({ diasSemana, tareas }: { diasSemana: Date[]; tareas: Tarea[] }) {
  const porDia = diasSemana.map(dia => tareas.filter(t => { const p = parseTarea(t); return p && isSameDay(p.fecha, dia) && !p.horaInicio; }));
  if (porDia.every(ts => ts.length === 0)) return null;
  return (
    <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid #E5E7EB" }}>
      <div style={{ width: 52, flexShrink: 0, paddingRight: 6, paddingTop: 4, textAlign: "right" }}>
        <span style={{ fontSize: 9, color: "#9CA3AF" }}>sin hora</span>
      </div>
      {diasSemana.map((_, i) => (
        <div key={i} style={{ flex: 1, borderLeft: "1px solid #F3F4F6", minHeight: 24, padding: "2px" }}>
          {porDia[i].map(t => (
            <div key={t.id} style={{ fontSize: 10, fontWeight: 500, padding: "1px 4px", borderRadius: 3, marginBottom: 1, background: `${PCOLOR[t.prioridad]}18`, color: PCOLOR[t.prioridad], borderLeft: `2px solid ${PCOLOR[t.prioridad]}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.titulo}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LineaHoraActual() {
  const [m, setM] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  useEffect(() => {
    const t = setInterval(() => { const n = new Date(); setM(n.getHours() * 60 + n.getMinutes()); }, 60000);
    return () => clearInterval(t);
  }, []);
  const top = (m / 60) * HORA_ALTO;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, zIndex: 2, pointerEvents: "none" }}>
      <div style={{ height: 2, background: "#4F46E5", position: "relative" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4F46E5", position: "absolute", left: -4, top: -3 }} />
      </div>
    </div>
  );
}

function SpeedDial({ onNuevaTarea, onNuevaRutina, onNuevoEvento }: {
  onNuevaTarea: () => void; onNuevaRutina: () => void; onNuevoEvento: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const opciones = [
    { label: "Rutina", color: "#059669", onClick: onNuevaRutina },
    { label: "Evento", color: "#6366F1", onClick: onNuevoEvento },
    { label: "Tarea",  color: "#D97706", onClick: onNuevaTarea  },
  ];
  return (
    <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 40 }}>
      {abierto && <div onClick={() => setAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: -1 }} />}
      <div style={{ position: "absolute", bottom: 60, right: 0, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
        {opciones.map((op, i) => (
          <div key={op.label} style={{ display: "flex", alignItems: "center", gap: 10, transform: abierto ? "translateY(0) scale(1)" : "translateY(16px) scale(0.9)", opacity: abierto ? 1 : 0, transition: `all 0.2s ease ${i * 0.06}s`, pointerEvents: abierto ? "auto" : "none" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", background: "#fff", padding: "4px 12px", borderRadius: 8, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>{op.label}</span>
            <button onClick={() => { setAbierto(false); op.onClick(); }} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: op.color, color: "#fff", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 2px 8px ${op.color}60` }}>+</button>
          </div>
        ))}
      </div>
      <button onClick={() => setAbierto(!abierto)} style={{ width: 52, height: 52, borderRadius: "50%", background: "#4F46E5", color: "#fff", border: "none", cursor: "pointer", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(79,70,229,0.4)", transform: abierto ? "rotate(45deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>+</button>
    </div>
  );
}

// ─── Modales ──────────────────────────────────────────────────────────────────

function ModalEvento({ slotInicial, onCerrar, onGuardado, apiFetch }: {
  slotInicial: { fecha: Date; hora: string } | null;
  onCerrar: () => void; onGuardado: () => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}) {
  const [titulo, setTitulo]   = useState("");
  const [fecha, setFecha]     = useState(slotInicial ? format(slotInicial.fecha, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
  const [hIni, setHIni]       = useState(slotInicial?.hora || "");
  const [hFin, setHFin]       = useState("");
  const [desc, setDesc]       = useState("");
  const [guardando, setG]     = useState(false);
  const [error, setError]     = useState("");

  async function guardar() {
    if (!titulo.trim()) { setError("El título es obligatorio."); return; }
    if (hIni && !hFin)  { setError("Añade una hora de fin."); return; }
    setG(true);
    try {
      const res = await apiFetch(`${BACKEND}/api/eventos`, { method: "POST", body: JSON.stringify({ titulo: titulo.trim(), descripcion: desc.trim() || null, fecha, horaInicio: hIni || null, horaFin: hFin || null }) });
      if (!res.ok) { setError("Error al guardar."); return; }
      onGuardado();
    } catch { setError("Error de conexión."); } finally { setG(false); }
  }

  return (
    <Overlay onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} style={estiloModal}>
        <h3 style={estiloTituloModal}>Nuevo evento</h3>
        <Campo label="Título"><input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Nombre del evento" style={estiloInput} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} /></Campo>
        <Campo label="Fecha"><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={estiloInput} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} /></Campo>
        <Campo label="Horario">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="time" value={hIni} onChange={e => setHIni(e.target.value)} style={{ ...estiloInput, flex: 1 }} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} />
            <span style={{ color: "#9CA3AF", flexShrink: 0 }}>→</span>
            <input type="time" value={hFin} onChange={e => setHFin(e.target.value)} style={{ ...estiloInput, flex: 1 }} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} />
          </div>
        </Campo>
        <Campo label="Descripción"><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Opcional" style={estiloInput} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} /></Campo>
        {error && <p style={{ fontSize: 13, color: "#EF4444", margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCerrar} style={{ ...estiloBotonSecundario, flex: 1 }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{ ...estiloBotonPrimario, flex: 2, opacity: guardando ? 0.7 : 1 }}>{guardando ? "Guardando…" : "Crear evento"}</button>
        </div>
      </div>
    </Overlay>
  );
}

function ModalRutina({ slotInicial, onCerrar, onGuardado, apiFetch }: {
  slotInicial: { fecha: Date; hora: string } | null;
  onCerrar: () => void; onGuardado: () => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}) {
  const [nombre, setNombre] = useState("");
  const [dia, setDia]       = useState(slotInicial ? diaIdx(slotInicial.fecha) : 0);
  const [hIni, setHIni]     = useState(slotInicial?.hora || "");
  const [hFin, setHFin]     = useState("");
  const [color, setColor]   = useState(COLORES_RUTINA[0]);
  const [guardando, setG]   = useState(false);
  const [error, setError]   = useState("");

  async function guardar() {
    if (!nombre.trim())   { setError("El nombre es obligatorio."); return; }
    if (!hIni || !hFin)   { setError("Las horas son obligatorias."); return; }
    setG(true);
    try {
      const res = await apiFetch(`${BACKEND}/api/rutinas`, { method: "POST", body: JSON.stringify({ nombre: nombre.trim(), diaSemana: dia, horaInicio: hIni, horaFin: hFin, color }) });
      if (!res.ok) { setError("Error al guardar."); return; }
      onGuardado();
    } catch { setError("Error de conexión."); } finally { setG(false); }
  }

  return (
    <Overlay onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} style={{ ...estiloModal, maxWidth: 480 }}>
        <h3 style={estiloTituloModal}>Nueva rutina</h3>
        <Campo label="Nombre"><input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Clase de matemáticas" style={estiloInput} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} /></Campo>
        <Campo label="Día de la semana">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {DIAS_LABELS.map((d, i) => (
              <button key={i} onClick={() => setDia(i)} style={{ padding: "5px 10px", borderRadius: 6, border: "1.5px solid", cursor: "pointer", fontSize: 12, fontWeight: 500, borderColor: dia === i ? "#4F46E5" : "#E5E7EB", background: dia === i ? "#EEF2FF" : "#fff", color: dia === i ? "#4F46E5" : "#6B7280" }}>{d}</button>
            ))}
          </div>
        </Campo>
        <Campo label="Horario">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="time" value={hIni} onChange={e => setHIni(e.target.value)} style={{ ...estiloInput, flex: 1 }} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} />
            <span style={{ color: "#9CA3AF", flexShrink: 0 }}>→</span>
            <input type="time" value={hFin} onChange={e => setHFin(e.target.value)} style={{ ...estiloInput, flex: 1 }} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} />
          </div>
        </Campo>
        <Campo label="Color">
          <div style={{ display: "flex", gap: 8 }}>
            {COLORES_RUTINA.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: "none", cursor: "pointer", outline: color === c ? `3px solid ${c}` : "none", outlineOffset: 2, transform: color === c ? "scale(1.2)" : "scale(1)", transition: "all 0.15s" }} />
            ))}
          </div>
        </Campo>
        {error && <p style={{ fontSize: 13, color: "#EF4444", margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCerrar} style={{ ...estiloBotonSecundario, flex: 1 }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{ ...estiloBotonPrimario, flex: 2, background: color, opacity: guardando ? 0.7 : 1 }}>{guardando ? "Guardando…" : "Crear rutina"}</button>
        </div>
      </div>
    </Overlay>
  );
}

const PCONFIG = { alta: { label: "Alta", color: "#EF4444", bg: "#FEF2F2" }, media: { label: "Media", color: "#D97706", bg: "#FFFBEB" }, baja: { label: "Baja", color: "#059669", bg: "#F0FDF4" } };

function ModalTareaSimple({ slotInicial, onCerrar, onGuardado, apiFetch }: {
  slotInicial: { fecha: Date; hora: string } | null;
  onCerrar: () => void; onGuardado: () => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}) {
  const [titulo, setTitulo]   = useState("");
  const [fecha, setFecha]     = useState(slotInicial ? format(slotInicial.fecha, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
  const [hIni, setHIni]       = useState(slotInicial?.hora || "");
  const [hFin, setHFin]       = useState("");
  const [prior, setPrior]     = useState<"baja"|"media"|"alta">("media");
  const [guardando, setG]     = useState(false);
  const [error, setError]     = useState("");

  async function guardar() {
    if (!titulo.trim()) { setError("El título es obligatorio."); return; }
    if (hIni && !hFin)  { setError("Añade una hora de fin."); return; }
    let fv = "";
    if (fecha && hIni && hFin) fv = `${fecha}T${hIni}:00|${hFin}`;
    else if (fecha && hIni)    fv = `${fecha}T${hIni}:00`;
    else if (fecha)            fv = `${fecha}T00:00:00`;
    setG(true);
    try {
      const res = await apiFetch(`${BACKEND}/api/tareas`, { method: "POST", body: JSON.stringify({ titulo: titulo.trim(), prioridad: prior, fecha_vencimiento: fv }) });
      if (!res.ok) { setError("Error al guardar."); return; }
      onGuardado();
    } catch { setError("Error de conexión."); } finally { setG(false); }
  }

  return (
    <Overlay onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} style={estiloModal}>
        <h3 style={estiloTituloModal}>Nueva tarea</h3>
        <Campo label="Título"><input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="¿Qué necesitas hacer?" style={estiloInput} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} /></Campo>
        <Campo label="Fecha límite"><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={estiloInput} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} /></Campo>
        <Campo label="Horario">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="time" value={hIni} onChange={e => setHIni(e.target.value)} style={{ ...estiloInput, flex: 1 }} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} />
            <span style={{ color: "#9CA3AF", flexShrink: 0 }}>→</span>
            <input type="time" value={hFin} onChange={e => setHFin(e.target.value)} style={{ ...estiloInput, flex: 1 }} onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")} onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")} />
          </div>
          {hIni && !hFin && <p style={{ fontSize: 11, color: "#D97706", margin: "5px 0 0" }}>Añade hora de fin para activar la detección automática</p>}
        </Campo>
        <Campo label="Prioridad">
          <div style={{ display: "flex", gap: 6 }}>
            {(["baja","media","alta"] as const).map(p => (
              <button key={p} onClick={() => setPrior(p)} style={{ flex: 1, padding: "8px 0", border: "1.5px solid", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, borderColor: prior === p ? PCONFIG[p].color : "#E5E7EB", background: prior === p ? PCONFIG[p].bg : "#fff", color: prior === p ? PCONFIG[p].color : "#9CA3AF" }}>{PCONFIG[p].label}</button>
            ))}
          </div>
        </Campo>
        {error && <p style={{ fontSize: 13, color: "#EF4444", margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCerrar} style={{ ...estiloBotonSecundario, flex: 1 }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{ ...estiloBotonPrimario, flex: 2, opacity: guardando ? 0.7 : 1 }}>{guardando ? "Guardando…" : "Crear tarea"}</button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <div onClick={onClick} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>{children}</div>;
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}><label style={estiloLabel}>{label}</label>{children}</div>;
}
function Punto({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}
function BtnNav({ children, onClick, style }: { children: React.ReactNode; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "#6B7280", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", ...style }}
      onMouseEnter={e => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.borderColor = "#D1D5DB"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
    >{children}</button>
  );
}

const estiloModal: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: "28px 24px 24px", width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", margin: "0 16px", maxHeight: "90vh", overflowY: "auto" };
const estiloTituloModal: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#1A1A1A", margin: "0 0 20px" };
const estiloLabel: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };
const estiloInput: React.CSSProperties = { width: "100%", padding: "11px 13px", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 14, color: "#1A1A1A", outline: "none", boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };
const estiloBotonPrimario: React.CSSProperties = { padding: "10px 20px", borderRadius: 10, background: "#4F46E5", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 };
const estiloBotonSecundario: React.CSSProperties = { padding: "10px 20px", borderRadius: 10, background: "#F3F4F6", color: "#6B7280", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 };