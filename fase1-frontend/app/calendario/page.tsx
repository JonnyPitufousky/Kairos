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

// Líneas más suaves
const COLOR_LINEA  = "#E9EAEC";
const COLOR_LINEA2 = "#DDDFE2"; // header bottom y exteriores

interface Tarea  { id: string; titulo: string; completado: boolean; fecha_vencimiento: string | null; prioridad: "baja" | "media" | "alta"; }
interface Rutina { id: string; nombre: string; diaSemana: number; horaInicio: string; horaFin: string; color: string | null; }
interface Evento          { id: string; titulo: string; descripcion: string | null; fecha: string; horaInicio: string | null; horaFin: string | null; }
interface RutinaExcepcion { id: string; rutinaId: string; fecha: string; }
type VistaType = "dia" | "semana" | "mes" | "ano";
interface Slot      { fecha: Date; hora: string; horaFin: string; }
interface Conflicto { tipo: "rutina" | "tarea" | "evento"; id: string; titulo: string; }
function solapan(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  const m = (h: string) => { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm; };
  return m(aIni) < m(bFin) && m(bIni) < m(aFin);
}

function mins0(hora: string): number { const [h, m] = hora.split(":").map(Number); return h * 60 + m; }
function parseTarea(t: Tarea): { fecha: Date; horaInicio: string | null; horaFin: string | null } | null {
  if (!t.fecha_vencimiento) return null;
  const [fp, fin] = t.fecha_vencimiento.split("|");
  const fecha = new Date(fp);
  const tieneHora = fecha.getHours() !== 0 || fecha.getMinutes() !== 0;
  const horaInicio = tieneHora ? `${String(fecha.getHours()).padStart(2,"0")}:${String(fecha.getMinutes()).padStart(2,"0")}` : null;
  return { fecha, horaInicio, horaFin: fin || null };
}
function diaIdx(date: Date): number { return (getDay(date) + 6) % 7; }
function horaFallback(h: string): string { return `${String(Math.min(23, parseInt(h.split(":")[0]) + 1)).padStart(2,"0")}:00`; }
function calcHoraFin(hora: string): string { const [h, m] = hora.split(":").map(Number); return `${String(Math.min(23, h + 1)).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }
function horaActualInt(): number { return new Date().getHours(); }

const PCOLOR: Record<string,string> = { alta: "#EF4444", media: "#D97706", baja: "#059669" };
const COLORES_RUTINA = ["#6366F1","#059669","#D97706","#EF4444","#8B5CF6","#0EA5E9","#EC4899","#14B8A6"];
const DIAS_LABELS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

export default function CalendarioPage() {
  const { getToken } = useAuth();
  const [vista, setVista]             = useState<VistaType>("semana");
  const [fechaRef, setFechaRef]       = useState(new Date());
  const [tareas, setTareas]           = useState<Tarea[]>([]);
  const [rutinas, setRutinas]         = useState<Rutina[]>([]);
  const [eventos, setEventos]         = useState<Evento[]>([]);
  const [excepciones, setExcepciones] = useState<RutinaExcepcion[]>([]);
  const [modalEvento, setModalEvento] = useState(false);
  const [modalRutina, setModalRutina] = useState(false);
  const [modalTarea, setModalTarea]   = useState(false);
  const [slot, setSlot]               = useState<Slot | null>(null);
  const [speedDial, setSpeedDial]     = useState(false);
  const [menuBloque, setMenuBloque]   = useState<{tipo:"tarea"|"rutina"|"evento"; id:string; titulo:string; fecha?:string} | null>(null);
  const [editarEvento, setEditarEvento] = useState<Evento | null>(null);
  const [editarRutina, setEditarRutina] = useState<Rutina | null>(null);
  const [editarTarea,  setEditarTarea]  = useState<Tarea  | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function apiFetch(url: string, options: RequestInit = {}) {
    const token = await getToken();
    return fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  }

  async function cargarDatos() {
    try {
      const [rT, rR, rE, rX] = await Promise.all([apiFetch(`${BACKEND}/api/tareas`), apiFetch(`${BACKEND}/api/rutinas`), apiFetch(`${BACKEND}/api/eventos`), apiFetch(`${BACKEND}/api/rutinas/excepciones`)]);
      const [dT, dR, dE, dX] = await Promise.all([rT.json(), rR.json(), rE.json(), rX.json()]);
      setTareas(Array.isArray(dT) ? dT : []); setRutinas(Array.isArray(dR) ? dR : []); setEventos(Array.isArray(dE) ? dE : []); setExcepciones(Array.isArray(dX) ? dX : []);
    } catch { /* silencioso */ }
  }

  useEffect(() => { cargarDatos(); }, []);
  useEffect(() => { if (scrollRef.current && (vista === "semana" || vista === "dia")) scrollRef.current.scrollTop = 7 * HORA_ALTO; }, [vista]);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // No navegar si hay un modal abierto o el foco está en un input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (modalEvento || modalRutina || modalTarea || editarEvento || editarRutina || editarTarea || menuBloque || speedDial) return;
      if (e.key === "ArrowLeft")  { e.preventDefault(); navAtras(); }
      if (e.key === "ArrowRight") { e.preventDefault(); navAdelante(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [vista, fechaRef, modalEvento, modalRutina, modalTarea, editarEvento, editarRutina, editarTarea, menuBloque, speedDial]);


  function navAtras()    { setFechaRef(d => vista==="dia" ? addDays(d,-1) : vista==="semana" ? addWeeks(d,-1) : vista==="mes" ? addMonths(d,-1) : new Date(getYear(d)-1,0,1)); }
  function navAdelante() { setFechaRef(d => vista==="dia" ? addDays(d,1)  : vista==="semana" ? addWeeks(d,1)  : vista==="mes" ? addMonths(d,1)  : new Date(getYear(d)+1,0,1)); }

  function tituloNav(): string {
    if (vista === "dia")    return format(fechaRef, "EEEE, d 'de' MMMM yyyy", { locale: es });
    if (vista === "semana") { const ini = startOfWeek(fechaRef, { weekStartsOn: 1 }); return `${format(ini,"d MMM",{locale:es})} – ${format(addDays(ini,6),"d MMM yyyy",{locale:es})}`; }
    if (vista === "mes")    return format(fechaRef, "MMMM yyyy", { locale: es });
    return String(getYear(fechaRef));
  }

  function abrirSlot(fecha: Date, hora: string) {
    setSlot({ fecha, hora, horaFin: calcHoraFin(hora) });
    setSpeedDial(true);
  }

  function abrirMenuBloque(tipo: "tarea"|"rutina"|"evento", id: string, titulo: string, fecha?: string) {
    setMenuBloque({ tipo, id, titulo, fecha });
  }

  async function eliminarBloque(tipo: "tarea"|"rutina"|"evento", id: string) {
    const path = tipo === "evento" ? "eventos" : tipo === "rutina" ? "rutinas" : "tareas";
    await apiFetch(`${BACKEND}/api/${path}/${id}`, { method: "DELETE" });
    setMenuBloque(null);
    cargarDatos();
  }

  async function eliminarRutinaDia(id: string, fecha: string) {
    await apiFetch(`${BACKEND}/api/rutinas/${id}/excepciones`, { method: "POST", body: JSON.stringify({ fecha }) });
    setMenuBloque(null);
    cargarDatos();
  }

  function editarBloque(tipo: "tarea"|"rutina"|"evento", id: string) {
    if (tipo === "evento") setEditarEvento(eventos.find(e => e.id === id) || null);
    else if (tipo === "rutina") setEditarRutina(rutinas.find(r => r.id === id) || null);
    else setEditarTarea(tareas.find(t => t.id === id) || null);
    setMenuBloque(null);
  }

  return (
    <div style={{ background: "#FAFAF9", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header navegación */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${COLOR_LINEA2}`, background: "#FAFAF9", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BtnNav onClick={navAtras}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></BtnNav>
          <BtnNav onClick={() => setFechaRef(new Date())} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}>Hoy</BtnNav>
          <BtnNav onClick={navAdelante}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></BtnNav>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginLeft: 10, textTransform: "capitalize" }}>{tituloNav()}</span>
        </div>
        <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 8, padding: 3, gap: 2 }}>
          {(["dia","semana","mes","ano"] as VistaType[]).map(v => (
            <button key={v} onClick={() => setVista(v)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all 0.15s", background: vista===v ? "#fff" : "transparent", color: vista===v ? "#1A1A1A" : "#6B7280", boxShadow: vista===v ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
              {v === "dia" ? "Día" : v === "semana" ? "Semana" : v === "mes" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {vista === "semana" && <VistaSemana fechaRef={fechaRef} tareas={tareas} rutinas={rutinas} eventos={eventos} excepciones={excepciones} scrollRef={scrollRef} onClickSlot={abrirSlot} onClickDia={d => { setFechaRef(d); setVista("dia"); }} onClickBloque={abrirMenuBloque} />}
        {vista === "dia"    && <VistaDia    fecha={fechaRef}    tareas={tareas} rutinas={rutinas} eventos={eventos} excepciones={excepciones} scrollRef={scrollRef} onClickSlot={abrirSlot} onClickBloque={abrirMenuBloque} />}
        {vista === "mes"    && <VistaMes    fechaRef={fechaRef} tareas={tareas} rutinas={rutinas} eventos={eventos} onClickDia={d => { setFechaRef(d); setVista("dia"); }} />}
        {vista === "ano"    && <VistaAno    fechaRef={fechaRef} tareas={tareas} rutinas={rutinas} eventos={eventos} onClickMes={d => { setFechaRef(d); setVista("mes"); }} />}
      </div>

      <SpeedDial abierto={speedDial} setAbierto={setSpeedDial}
        onNuevaTarea={() => { setSpeedDial(false); setModalTarea(true); }}
        onNuevaRutina={() => { setSpeedDial(false); setModalRutina(true); }}
        onNuevoEvento={() => { setSpeedDial(false); setModalEvento(true); }}
      />

      {menuBloque && (
        <MenuBloque
          titulo={menuBloque.titulo}
          tipo={menuBloque.tipo}
          fecha={menuBloque.fecha}
          onEditar={() => editarBloque(menuBloque.tipo, menuBloque.id)}
          onEliminarDia={() => eliminarRutinaDia(menuBloque.id, menuBloque.fecha!)}
          onEliminarSiempre={() => eliminarBloque(menuBloque.tipo, menuBloque.id)}
          onCerrar={() => setMenuBloque(null)}
        />
      )}

      {modalEvento && <ModalEvento slotInicial={slot} onCerrar={() => { setModalEvento(false); setSlot(null); }} onGuardado={() => { setModalEvento(false); setSlot(null); cargarDatos(); }} apiFetch={apiFetch} tareas={tareas} rutinas={rutinas} eventos={eventos} />}
      {modalRutina && <ModalRutina slotInicial={slot} onCerrar={() => { setModalRutina(false); setSlot(null); }} onGuardado={() => { setModalRutina(false); setSlot(null); cargarDatos(); }} apiFetch={apiFetch} tareas={tareas} rutinas={rutinas} eventos={eventos} />}
      {modalTarea  && <ModalTareaSimple slotInicial={slot} onCerrar={() => { setModalTarea(false); setSlot(null); }} onGuardado={() => { setModalTarea(false); setSlot(null); cargarDatos(); }} apiFetch={apiFetch} tareas={tareas} rutinas={rutinas} eventos={eventos} />}

      {editarEvento && <ModalEvento eventoEditar={editarEvento} slotInicial={null} onCerrar={() => setEditarEvento(null)} onGuardado={() => { setEditarEvento(null); cargarDatos(); }} apiFetch={apiFetch} tareas={tareas} rutinas={rutinas} eventos={eventos} />}
      {editarRutina && <ModalRutina rutinaEditar={editarRutina} slotInicial={null} onCerrar={() => setEditarRutina(null)} onGuardado={() => { setEditarRutina(null); cargarDatos(); }} apiFetch={apiFetch} tareas={tareas} rutinas={rutinas} eventos={eventos} />}
      {editarTarea  && <ModalTareaSimple tareaEditar={editarTarea} slotInicial={null} onCerrar={() => setEditarTarea(null)} onGuardado={() => { setEditarTarea(null); cargarDatos(); }} apiFetch={apiFetch} tareas={tareas} rutinas={rutinas} eventos={eventos} />}
    </div>
  );
}

// ─── Vista Semana ─────────────────────────────────────────────────────────────
// El header de días va DENTRO del contenedor scrollable como sticky.
// Esto evita el desalineamiento causado por el scrollbar.

function VistaSemana({ fechaRef, tareas, rutinas, eventos, excepciones, scrollRef, onClickSlot, onClickDia, onClickBloque }: {
  fechaRef: Date; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[]; excepciones: RutinaExcepcion[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onClickSlot: (f: Date, h: string) => void; onClickDia: (f: Date) => void;
  onClickBloque: (tipo: "tarea"|"rutina"|"evento", id: string, titulo: string, fecha?: string) => void;
}) {
  const ini  = startOfWeek(fechaRef, { weekStartsOn: 1 });
  const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i));
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  const porDia = dias.map(dia =>
    tareas.filter(t => { const p = parseTarea(t); return p && isSameDay(p.fecha, dia) && !p.horaInicio; })
  );

  function toggleDia(i: number) {
    setExpandidos(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  const hayExpandido = dias.some((_, i) => expandidos.has(i) && porDia[i].length > 0);

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <div ref={scrollRef} style={{ height: "100%", overflowY: "auto" }}>

        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#FAFAF9", borderBottom: `2px solid ${COLOR_LINEA2}` }}>
          <div style={{ display: "flex" }}>
            <div style={{ width: 52, flexShrink: 0 }} />
            {dias.map((dia, i) => {
              const hoy   = isToday(dia);
              const count = porDia[i].length;
              const exp   = expandidos.has(i);
              return (
                <div key={i} style={{ flex: 1, textAlign: "center", padding: "6px 0 5px", borderLeft: `1px solid ${COLOR_LINEA2}`, background: hoy ? "#F0FDF4" : "#FAFAF9" }}>
                  <div onClick={() => onClickDia(dia)} style={{ cursor: "pointer" }}>
                    <p style={{ fontSize: 10, color: hoy ? "#16A34A" : "#9CA3AF", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: hoy ? 700 : 500 }}>
                      {format(dia, "EEE", { locale: es })}
                    </p>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", margin: "0 auto", background: hoy ? "#16A34A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: hoy ? 700 : 400, color: hoy ? "#fff" : "#1A1A1A" }}>{format(dia, "d")}</span>
                    </div>
                  </div>
                  {count > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); toggleDia(i); }}
                      style={{ marginTop: 4, fontSize: 10, padding: "2px 7px", borderRadius: 10, border: "none", cursor: "pointer", background: exp ? "#EEF2FF" : "#F3F4F6", color: exp ? "#4F46E5" : "#9CA3AF", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3, transition: "all 0.15s" }}
                    >
                      {count} {count === 1 ? "tarea" : "tareas"}
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: exp ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {hayExpandido && (
            <div style={{ display: "flex", borderTop: `1px solid ${COLOR_LINEA}` }}>
              <div style={{ width: 52, flexShrink: 0 }} />
              {dias.map((_, i) => (
                <div key={i} style={{ flex: 1, borderLeft: `1px solid ${COLOR_LINEA}`, padding: expandidos.has(i) && porDia[i].length > 0 ? "3px" : "0", overflow: "hidden" }}>
                  {expandidos.has(i) && porDia[i].map(t => (
                    <div key={t.id} style={{ fontSize: 12, fontWeight: 500, padding: "5px 5px", borderRadius: 4, marginBottom: 2, background: `${PCOLOR[t.prioridad]}18`, color: PCOLOR[t.prioridad], borderLeft: `2px solid ${PCOLOR[t.prioridad]}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.titulo}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Grid de horas */}
        <div style={{ display: "flex" }}>
          <div style={{ width: 52, flexShrink: 0 }}>
            {HORAS.map(h => (
              <div key={h} style={{ height: HORA_ALTO, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 4 }}>
                {h > 0 && <span style={{ fontSize: 11, fontWeight: 500, color: "#9CA3AF" }}>{String(h).padStart(2,"0")}:00</span>}
              </div>
            ))}
          </div>
          {dias.map((dia, i) => (
            <ColumnaDia key={i} dia={dia} diaIdx={diaIdx(dia)} tareas={tareas} rutinas={rutinas} eventos={eventos} excepciones={excepciones} scrollRef={scrollRef} onClickSlot={onClickSlot} onClickBloque={onClickBloque} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Columna día ──────────────────────────────────────────────────────────────

function ColumnaDia({ dia, diaIdx: dIdx, tareas, rutinas, eventos, excepciones, scrollRef, onClickSlot, onClickBloque }: {
  dia: Date; diaIdx: number; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[]; excepciones: RutinaExcepcion[];
  scrollRef: React.RefObject<HTMLDivElement | null>; onClickSlot: (f: Date, h: string) => void;
  onClickBloque: (tipo: "tarea"|"rutina"|"evento", id: string, titulo: string, fecha?: string) => void;
}) {
  const hoy        = isToday(dia);
  const horaActual = hoy ? horaActualInt() : -1;
  const [horaHover, setHoraHover] = useState<number | null>(null);
  const [horaClick, setHoraClick] = useState<number | null>(null);
  const fechaStr   = format(dia, "yyyy-MM-dd");

  const rutinasDia = rutinas.filter(r => r.diaSemana === dIdx && !excepciones.some(e => e.rutinaId === r.id && e.fecha === fechaStr));
  const tareasDia  = tareas.filter(t => { const p = parseTarea(t); return p && isSameDay(p.fecha, dia) && p.horaInicio; });
  const eventosDia = eventos.filter(e => e.horaInicio && isSameDay(new Date(e.fecha), dia));

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setHoraHover(Math.floor(y / HORA_ALTO));
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = Math.floor(y / HORA_ALTO);
    setHoraClick(h);
    setTimeout(() => setHoraClick(null), 350);
    onClickSlot(dia, `${String(h).padStart(2,"0")}:00`);
  }

  return (
    <div style={{ flex: 1, position: "relative", borderLeft: `1px solid ${COLOR_LINEA}` }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoraHover(null)}
      onClick={handleClick}
    >
      {HORAS.map(h => {
        const esActual = hoy && h === horaActual;
        const isClick  = horaClick === h;
        const isHover  = horaHover === h && !isClick;
        return (
          <div key={h} style={{
            height: HORA_ALTO,
            borderTop: `1px solid ${COLOR_LINEA}`,
            boxShadow: esActual
              ? "inset 0 0 0 2px #16A34A"
              : isClick
              ? "inset 0 0 0 1px #6366F1"
              : "none",
            background: isClick ? "#EEF2FF" : isHover ? "#F5F6F8" : "transparent",
            transition: "background 0.15s",
            cursor: "pointer",
          }} />
        );
      })}
      {rutinasDia.map(r  => <BloqueHorario key={`r-${r.id}`}  id={r.id}  titulo={r.nombre}  horaInicio={r.horaInicio}  horaFin={r.horaFin}  color={r.color||"#6366F1"} tipo="rutina"  fecha={fechaStr} onClickBloque={onClickBloque} />)}
      {tareasDia.map(t   => { const p=parseTarea(t)!; return <BloqueHorario key={`t-${t.id}`} id={t.id} titulo={t.titulo} horaInicio={p.horaInicio!} horaFin={p.horaFin||horaFallback(p.horaInicio!)} color={PCOLOR[t.prioridad]} tipo="tarea"  completado={t.completado} onClickBloque={onClickBloque} />; })}
      {eventosDia.map(ev => <BloqueHorario key={`e-${ev.id}`} id={ev.id} titulo={ev.titulo} horaInicio={ev.horaInicio!} horaFin={ev.horaFin||horaFallback(ev.horaInicio!)} color="#6366F1" tipo="evento" onClickBloque={onClickBloque} />)}
    </div>
  );
}

// ─── Vista Día ────────────────────────────────────────────────────────────────

function VistaDia({ fecha, tareas, rutinas, eventos, excepciones, scrollRef, onClickSlot, onClickBloque }: {
  fecha: Date; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[]; excepciones: RutinaExcepcion[];
  scrollRef: React.RefObject<HTMLDivElement | null>; onClickSlot: (f: Date, h: string) => void;
  onClickBloque: (tipo: "tarea"|"rutina"|"evento", id: string, titulo: string, fecha?: string) => void;
}) {
  const hoy        = isToday(fecha);
  const horaActual = hoy ? horaActualInt() : -1;
  const [horaHover, setHoraHover] = useState<number | null>(null);
  const [horaClick, setHoraClick] = useState<number | null>(null);
  const [todoDiaExpandido, setTodoDiaExpandido] = useState(false);
  const idx        = diaIdx(fecha);
  const fechaStr   = format(fecha, "yyyy-MM-dd");
  const rutinasDia = rutinas.filter(r => r.diaSemana === idx && !excepciones.some(e => e.rutinaId === r.id && e.fecha === fechaStr));
  const tareasDia  = tareas.filter(t => { const p=parseTarea(t); return p && isSameDay(p.fecha,fecha) && p.horaInicio; });
  const sinHora    = tareas.filter(t => { const p=parseTarea(t); return p && isSameDay(p.fecha,fecha) && !p.horaInicio; });
  const eventosDia = eventos.filter(e => e.horaInicio && isSameDay(new Date(e.fecha),fecha));

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setHoraHover(Math.floor(y / HORA_ALTO));
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = Math.floor(y / HORA_ALTO);
    setHoraClick(h);
    setTimeout(() => setHoraClick(null), 350);
    onClickSlot(fecha, `${String(h).padStart(2,"0")}:00`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {sinHora.length > 0 && (
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${COLOR_LINEA2}` }}>
          <div style={{ display: "flex", alignItems: "center", padding: "5px 16px 5px 0" }}>
            <div style={{ width: 52, flexShrink: 0 }} />
            <button
              onClick={() => setTodoDiaExpandido(v => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: todoDiaExpandido ? "#EEF2FF" : "#F3F4F6", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: todoDiaExpandido ? "#4F46E5" : "#6B7280", transition: "all 0.15s" }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: todoDiaExpandido ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
              Todo el día · {sinHora.length} {sinHora.length === 1 ? "tarea" : "tareas"}
            </button>
          </div>
          {todoDiaExpandido && (
            <div style={{ paddingBottom: 6 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 12px" }}>
                {sinHora.map(t => (
                  <div key={t.id} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: `${PCOLOR[t.prioridad]}18`, color: PCOLOR[t.prioridad], borderLeft: `3px solid ${PCOLOR[t.prioridad]}`, fontWeight: 500 }}>
                    {t.titulo}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", maxWidth: 680, margin: "0 auto" }}>
          <div style={{ width: 52, flexShrink: 0 }}>
            {HORAS.map(h => (
              <div key={h} style={{ height: HORA_ALTO, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 4 }}>
                {h > 0 && <span style={{ fontSize: 11, fontWeight: 500, color: "#9CA3AF" }}>{String(h).padStart(2,"0")}:00</span>}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative", borderLeft: `1px solid ${COLOR_LINEA}` }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoraHover(null)}
            onClick={handleClick}
          >
            {HORAS.map(h => {
              const esActual = hoy && h === horaActual;
              const isClick  = horaClick === h;
              const isHover  = horaHover === h && !isClick;
              return (
                <div key={h} style={{
                  height: HORA_ALTO,
                  borderTop: `1px solid ${COLOR_LINEA}`,
                  boxShadow: esActual ? "inset 0 0 0 2px #16A34A" : isClick ? "inset 0 0 0 1px #6366F1" : "none",
                  background: isClick ? "#EEF2FF" : isHover ? "#F5F6F8" : "transparent",
                  transition: "background 0.15s",
                  cursor: "pointer",
                }} />
              );
            })}
            {rutinasDia.map(r  => <BloqueHorario key={`r-${r.id}`}  id={r.id}  titulo={r.nombre}  horaInicio={r.horaInicio}  horaFin={r.horaFin}  color={r.color||"#6366F1"} tipo="rutina"  fecha={fechaStr} onClickBloque={onClickBloque} />)}
            {tareasDia.map(t   => { const p=parseTarea(t)!; return <BloqueHorario key={`t-${t.id}`} id={t.id} titulo={t.titulo} horaInicio={p.horaInicio!} horaFin={p.horaFin||horaFallback(p.horaInicio!)} color={PCOLOR[t.prioridad]} tipo="tarea"  completado={t.completado} onClickBloque={onClickBloque} />; })}
            {eventosDia.map(ev => <BloqueHorario key={`e-${ev.id}`} id={ev.id} titulo={ev.titulo} horaInicio={ev.horaInicio!} horaFin={ev.horaFin||horaFallback(ev.horaInicio!)} color="#6366F1" tipo="evento" onClickBloque={onClickBloque} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Vista Mes ────────────────────────────────────────────────────────────────

function VistaMes({ fechaRef, tareas, rutinas, eventos, onClickDia }: {
  fechaRef: Date; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[]; onClickDia: (f: Date) => void;
}) {
  const iniGrid = startOfWeek(startOfMonth(fechaRef), { weekStartsOn: 1 });
  const dias    = Array.from({ length: 42 }, (_, i) => addDays(iniGrid, i));
  function items(dia: Date) {
    const idx = diaIdx(dia);
    return { rutinas: rutinas.some(r=>r.diaSemana===idx), tareas: tareas.some(t=>{const p=parseTarea(t);return p&&isSameDay(p.fecha,dia);}), eventos: eventos.some(e=>isSameDay(new Date(e.fecha),dia)) };
  }
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 24px 32px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: COLOR_LINEA2, borderRadius: 12, overflow: "hidden" }}>
        {dias.map((dia, i) => {
          const esteMes = isSameMonth(dia, fechaRef);
          const hoy     = isToday(dia);
          const it      = items(dia);
          return (
            <div key={i} onClick={() => onClickDia(dia)} style={{ background: hoy ? "#F0FDF4" : "#FAFAF9", padding: "8px", minHeight: 76, cursor: "pointer", opacity: esteMes ? 1 : 0.3, transition: "background 0.12s", outline: hoy ? "2px solid #16A34A" : "none", outlineOffset: -2 }}
              onMouseEnter={e => (e.currentTarget.style.background = hoy ? "#DCFCE7" : "#F3F4F6")}
              onMouseLeave={e => (e.currentTarget.style.background = hoy ? "#F0FDF4" : "#FAFAF9")}
            >
              <div style={{ width: 26, height: 26, borderRadius: "50%", marginBottom: 5, background: hoy ? "#16A34A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 13, fontWeight: hoy ? 700 : 400, color: hoy ? "#fff" : "#1A1A1A" }}>{format(dia,"d")}</span>
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
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}><Punto color={l.color}/><span style={{fontSize:12,color:"#6B7280"}}>{l.label}</span></div>
        ))}
      </div>
    </div>
  );
}

// ─── Vista Año ────────────────────────────────────────────────────────────────

function VistaAno({ fechaRef, tareas, rutinas, eventos, onClickMes }: {
  fechaRef: Date; tareas: Tarea[]; rutinas: Rutina[]; eventos: Evento[]; onClickMes: (f: Date) => void;
}) {
  const year  = getYear(fechaRef);
  const meses = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  function tieneItems(dia: Date): boolean {
    const idx = diaIdx(dia);
    if (rutinas.some(r=>r.diaSemana===idx)) return true;
    if (tareas.some(t=>{const p=parseTarea(t);return p&&isSameDay(p.fecha,dia);})) return true;
    if (eventos.some(e=>isSameDay(new Date(e.fecha),dia))) return true;
    return false;
  }
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px 40px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, maxWidth: 880, margin: "0 auto" }}>
        {meses.map((mes, mi) => {
          const iniGrid = startOfWeek(startOfMonth(mes), { weekStartsOn: 1 });
          const dias    = Array.from({ length: 35 }, (_, j) => addDays(iniGrid, j));
          return (
            <div key={mi} onClick={() => onClickMes(mes)} style={{ background: "#fff", borderRadius: 12, padding: "12px 10px", border: `1px solid ${COLOR_LINEA2}`, cursor: "pointer", transition: "box-shadow 0.15s" }}
              onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.08)")}
              onMouseLeave={e=>(e.currentTarget.style.boxShadow="none")}
            >
              <p style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px", textTransform: "capitalize" }}>{format(mes,"MMMM",{locale:es})}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {["L","M","X","J","V","S","D"].map(d=><div key={d} style={{textAlign:"center",fontSize:8,color:"#9CA3AF",paddingBottom:2}}>{d}</div>)}
                {dias.map((dia, j) => {
                  const esteMes=isSameMonth(dia,mes); const hoy=isToday(dia); const tiene=esteMes&&tieneItems(dia);
                  return (
                    <div key={j} style={{textAlign:"center",position:"relative",padding:"1px 0"}}>
                      <span style={{fontSize:9,display:"inline-flex",width:14,height:14,borderRadius:"50%",alignItems:"center",justifyContent:"center",background:hoy?"#16A34A":"transparent",color:hoy?"#fff":esteMes?"#1A1A1A":"#D1D5DB",fontWeight:hoy?700:400}}>
                        {esteMes?format(dia,"d"):""}
                      </span>
                      {tiene&&!hoy&&<span style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:3,height:3,borderRadius:"50%",background:"#4F46E5",display:"block"}}/>}
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

// ─── Bloque horario ───────────────────────────────────────────────────────────

function BloqueHorario({ id, titulo, horaInicio, horaFin, color, tipo, completado, fecha, onClickBloque }: { id:string; titulo:string; horaInicio:string; horaFin:string; color:string; tipo:"rutina"|"tarea"|"evento"; completado?:boolean; fecha?:string; onClickBloque:(tipo:"tarea"|"rutina"|"evento",id:string,titulo:string,fecha?:string)=>void; }) {
  const top    = (mins0(horaInicio)/60)*HORA_ALTO;
  const height = Math.max(((mins0(horaFin)-mins0(horaInicio))/60)*HORA_ALTO, 18);
  return (
    <div onClick={e=>{e.stopPropagation();onClickBloque(tipo,id,titulo,fecha);}} style={{position:"absolute",left:0,right:0,top,height,background:`${color}1A`,borderLeft:`3px solid ${color}`,borderRadius:"0 5px 5px 0",padding:"2px 5px",overflow:"hidden",cursor:"pointer",zIndex:1,transition:"filter 0.15s"}}
      onMouseEnter={e=>(e.currentTarget.style.filter="brightness(0.93)")}
      onMouseLeave={e=>(e.currentTarget.style.filter="none")}
    >
      <p style={{fontSize:11,fontWeight:600,color,margin:0,lineHeight:1.3,textDecoration:completado?"line-through":"none",opacity:completado?0.5:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{titulo}</p>
      {height>28&&<p style={{fontSize:10,color,opacity:0.65,margin:"1px 0 0"}}>{horaInicio} – {horaFin}</p>}
    </div>
  );
}


// ─── Speed Dial ───────────────────────────────────────────────────────────────

function SpeedDial({ onNuevaTarea, onNuevaRutina, onNuevoEvento, abierto, setAbierto }: {
  onNuevaTarea:()=>void; onNuevaRutina:()=>void; onNuevoEvento:()=>void;
  abierto:boolean; setAbierto:(v:boolean)=>void;
}) {
  const opciones = [
    { label:"Rutina", color:"#059669", onClick:onNuevaRutina },
    { label:"Evento", color:"#6366F1", onClick:onNuevoEvento },
    { label:"Tarea",  color:"#D97706", onClick:onNuevaTarea  },
  ];
  return (
    <div style={{ position:"fixed", bottom:32, right:32, zIndex:40 }}>
      {abierto && <div onClick={()=>setAbierto(false)} style={{position:"fixed",inset:0,zIndex:-1}}/>}
      <div style={{ position:"absolute", bottom:60, right:0, display:"flex", flexDirection:"column", gap:10, alignItems:"flex-end" }}>
        {opciones.map((op,i) => (
          <div key={op.label} style={{ display:"flex", alignItems:"center", gap:10, transform:abierto?"translateY(0) scale(1)":"translateY(16px) scale(0.9)", opacity:abierto?1:0, transition:`all 0.2s ease ${i*0.06}s`, pointerEvents:abierto?"auto":"none" }}>
            <span style={{ fontSize:12, fontWeight:600, color:"#1A1A1A", background:"#fff", padding:"4px 12px", borderRadius:8, whiteSpace:"nowrap", boxShadow:"0 2px 8px rgba(0,0,0,0.1)" }}>{op.label}</span>
            <button onClick={()=>{setAbierto(false);op.onClick();}} style={{ width:40, height:40, borderRadius:"50%", border:"none", background:op.color, color:"#fff", cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 2px 8px ${op.color}60` }}>+</button>
          </div>
        ))}
      </div>
      <button onClick={()=>setAbierto(!abierto)} style={{ width:52, height:52, borderRadius:"50%", background:"#4F46E5", color:"#fff", border:"none", cursor:"pointer", fontSize:26, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(79,70,229,0.4)", transform:abierto?"rotate(45deg)":"rotate(0deg)", transition:"transform 0.2s ease" }}>+</button>
    </div>
  );
}

// ─── Modales ──────────────────────────────────────────────────────────────────

function MenuBloque({ titulo, tipo, fecha, onEditar, onEliminarDia, onEliminarSiempre, onCerrar }: {
  titulo: string; tipo: "tarea"|"rutina"|"evento"; fecha?: string;
  onEditar: () => void; onEliminarDia: () => void;
  onEliminarSiempre: () => void; onCerrar: () => void;
}) {
  const [fase, setFase] = useState<"menu" | "eliminar">("menu");
  const esRutina = tipo === "rutina" && !!fecha;

  // Obtiene el nombre del día a partir de la fecha para el mensaje contextual
  const nombreDia = fecha
    ? format(new Date(fecha), "EEEE", { locale: es })
    : "";

  return (
    <Overlay onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} style={{ ...estiloModal, maxWidth: 320 }}>

        <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
          {tipo === "rutina" ? "Rutina" : tipo === "evento" ? "Evento" : "Tarea"}
        </p>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", margin: "0 0 20px", lineHeight: 1.3 }}>
          {titulo}
        </h3>

        {fase === "menu" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={onEditar} style={{ ...estiloBotonPrimario, width: "100%" }}>
              Editar
            </button>
            <button
              onClick={() => esRutina ? setFase("eliminar") : onEliminarSiempre()}
              style={{ ...estiloBotonSecundario, width: "100%", color: "#EF4444", transition: "background 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#F3F4F6"; }}
            >
              Eliminar
            </button>
          </div>
        )}

        {fase === "eliminar" && esRutina && (
          <>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
              ¿Quieres eliminar solo esta vez o siempre?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
             <button
                onClick={onEliminarDia}
                style={{ ...estiloBotonSecundario, width: "100%", textAlign: "left", color: "#D97706", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#FFF7ED"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#F3F4F6"; }}
              >
                <span style={{ display: "block", fontWeight: 600 }}>Solo este {nombreDia}</span>
                <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF" }}>
                  La rutina seguirá existiendo el resto de semanas
                </span>
              </button>
              <button
                onClick={onEliminarSiempre}
                style={{ ...estiloBotonSecundario, width: "100%", textAlign: "left", color: "#EF4444", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#F3F4F6"; }}
              >
                <span style={{ display: "block", fontWeight: 600 }}>Eliminar siempre</span>
                <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF" }}>
                  Se borrará de todos los {nombreDia.endsWith('s') ? nombreDia : nombreDia + 's'}
                </span>
              </button>
              <button
                onClick={() => setFase("menu")}
                style={{ ...estiloBotonSecundario, width: "100%", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#E5E7EB"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#F3F4F6"; }}
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

function ModalEvento({ slotInicial, eventoEditar, onCerrar, onGuardado, apiFetch, tareas, rutinas: _r, eventos }: { slotInicial:Slot|null; eventoEditar?:Evento|null; onCerrar:()=>void; onGuardado:()=>void; apiFetch:(url:string,options?:RequestInit)=>Promise<Response>; tareas:Tarea[]; rutinas:Rutina[]; eventos:Evento[]; }) {
  const [titulo,setTitulo]=useState(eventoEditar?.titulo||"");
  const [fecha,setFecha]=useState(eventoEditar?.fecha||(slotInicial?format(slotInicial.fecha,"yyyy-MM-dd"):format(new Date(),"yyyy-MM-dd")));
  const [hIni,setHIni]=useState(eventoEditar?.horaInicio||slotInicial?.hora||"");
  const [hFin,setHFin]=useState(eventoEditar?.horaFin||slotInicial?.horaFin||"");
  const [desc,setDesc]=useState(eventoEditar?.descripcion||"");
  const [guardando,setG]=useState(false);
  const [error,setError]=useState("");
  const [conflictos,setConflictos]=useState<Conflicto[]>([]);
  const [fase,setFase]=useState<"form"|"conflicto"|"confirmar">("form");
  const esEdicion = !!eventoEditar;

  function detectar(): Conflicto[] {
    if (!hIni || !hFin) return [];
    const cs: Conflicto[] = [];
    eventos.forEach(e => {
      if (e.id === eventoEditar?.id || !e.horaInicio || !e.horaFin) return;
      if (e.fecha.slice(0,10) === fecha && solapan(hIni, hFin, e.horaInicio, e.horaFin))
        cs.push({ tipo:"evento", id:e.id, titulo:e.titulo });
    });
    tareas.forEach(t => {
      const p = parseTarea(t); if (!p?.horaInicio || !p?.horaFin) return;
      if (t.fecha_vencimiento!.split("|")[0].split("T")[0] === fecha && solapan(hIni, hFin, p.horaInicio, p.horaFin))
        cs.push({ tipo:"tarea", id:t.id, titulo:t.titulo });
    });
    return cs;
  }

  async function guardar() {
    if (!titulo.trim()) { setError("El título es obligatorio."); return; }
    if (hIni && !hFin) { setError("Añade una hora de fin."); return; }
    if (hIni && hFin && hFin <= hIni) { setError("La hora de fin debe ser posterior a la de inicio."); return; }
    const cs = detectar();
    if (cs.length > 0) { setConflictos(cs); setFase("conflicto"); return; }
    await guardarDefinitivo([]);
  }

  async function guardarDefinitivo(eliminar: Conflicto[]) {
    setG(true);
    try {
      await Promise.all(eliminar.map(c => apiFetch(`${BACKEND}/api/${c.tipo==="evento"?"eventos":c.tipo==="rutina"?"rutinas":"tareas"}/${c.id}`, { method:"DELETE" })));
      const body = JSON.stringify({ titulo:titulo.trim(), descripcion:desc.trim()||null, fecha, horaInicio:hIni||null, horaFin:hFin||null });
      const res = esEdicion
        ? await apiFetch(`${BACKEND}/api/eventos/${eventoEditar!.id}`, { method:"PUT", body })
        : await apiFetch(`${BACKEND}/api/eventos`, { method:"POST", body });
      if (!res.ok) { setError("Error al guardar."); setFase("form"); return; }
      onGuardado();
    } catch { setError("Error de conexión."); setFase("form"); } finally { setG(false); }
  }

  return (
    <Overlay onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={estiloModal}>
        {fase==="form" && <>
          <h3 style={estiloTituloModal}>{esEdicion?"Editar evento":"Nuevo evento"}</h3>
          <Campo label="Título"><input autoFocus value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Nombre del evento" style={estiloInput} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/></Campo>
          <Campo label="Fecha"><input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={estiloInput} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/></Campo>
          <Campo label="Horario"><div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="time" value={hIni} onChange={e=>setHIni(e.target.value)} style={{...estiloInput,flex:1}} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/>
            <span style={{color:"#9CA3AF",flexShrink:0}}>→</span>
            <input type="time" value={hFin} onChange={e=>setHFin(e.target.value)} style={{...estiloInput,flex:1}} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/>
          </div></Campo>
          <Campo label="Descripción"><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Opcional" style={estiloInput} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/></Campo>
          {error&&<p style={{fontSize:13,color:"#EF4444",margin:"0 0 12px"}}>{error}</p>}
          <div style={{display:"flex",gap:10}}><button onClick={onCerrar} style={{...estiloBotonSecundario,flex:1}}>Cancelar</button><button onClick={guardar} disabled={guardando} style={{...estiloBotonPrimario,flex:2,opacity:guardando?0.7:1}}>{guardando?"Guardando…":esEdicion?"Guardar cambios":"Crear evento"}</button></div>
        </>}
        {fase==="conflicto" && <PanelConflicto conflictos={conflictos} onSustituir={()=>setFase("confirmar")} onVolver={()=>setFase("form")} />}
        {fase==="confirmar" && <PanelConfirmar conflictos={conflictos} guardando={guardando} onConfirmar={()=>guardarDefinitivo(conflictos)} onVolver={()=>setFase("conflicto")} />}
      </div>
    </Overlay>
  );
}

function ModalRutina({ slotInicial, rutinaEditar, onCerrar, onGuardado, apiFetch, tareas:_t, rutinas, eventos:_e }: { slotInicial:Slot|null; rutinaEditar?:Rutina|null; onCerrar:()=>void; onGuardado:()=>void; apiFetch:(url:string,options?:RequestInit)=>Promise<Response>; tareas:Tarea[]; rutinas:Rutina[]; eventos:Evento[]; }) {
  const esEdicion = !!rutinaEditar;
  const [nombre,setNombre]=useState(rutinaEditar?.nombre||"");
  const [dias,setDias]=useState<number[]>(rutinaEditar?[rutinaEditar.diaSemana]:[slotInicial?diaIdx(slotInicial.fecha):0]);
  const [hIni,setHIni]=useState(rutinaEditar?.horaInicio||slotInicial?.hora||"");
  const [hFin,setHFin]=useState(rutinaEditar?.horaFin||slotInicial?.horaFin||"");
  const [color,setColor]=useState(rutinaEditar?.color||COLORES_RUTINA[0]);
  const [guardando,setG]=useState(false);
  const [error,setError]=useState("");
  const [conflictos,setConflictos]=useState<Conflicto[]>([]);
  const [fase,setFase]=useState<"form"|"conflicto"|"confirmar">("form");
  function toggleDia(i:number){if(esEdicion)return;setDias(prev=>prev.includes(i)?prev.filter(d=>d!==i):[...prev,i]);}

  function detectar(): Conflicto[] {
    if (!hIni || !hFin) return [];
    const cs: Conflicto[] = [];
    dias.forEach(dia => {
      rutinas.forEach(r => {
        if (r.id === rutinaEditar?.id || r.diaSemana !== dia) return;
        if (solapan(hIni, hFin, r.horaInicio, r.horaFin))
          cs.push({ tipo:"rutina", id:r.id, titulo:r.nombre });
      });
    });
    return cs;
  }

  async function guardar() {
    if (!nombre.trim()) { setError("El nombre es obligatorio."); return; }
    if (!esEdicion && dias.length===0) { setError("Selecciona al menos un día."); return; }
    if (!hIni || !hFin) { setError("Las horas son obligatorias."); return; }
    if (hFin <= hIni) { setError("La hora de fin debe ser posterior a la de inicio."); return; }
    const cs = detectar();
    if (cs.length > 0) { setConflictos(cs); setFase("conflicto"); return; }
    await guardarDefinitivo([]);
  }

  async function guardarDefinitivo(eliminar: Conflicto[]) {
    setG(true);
    try {
      await Promise.all(eliminar.map(c => apiFetch(`${BACKEND}/api/rutinas/${c.id}`, { method:"DELETE" })));
      if (esEdicion) {
        await apiFetch(`${BACKEND}/api/rutinas/${rutinaEditar!.id}`, { method:"PUT", body:JSON.stringify({ nombre:nombre.trim(), horaInicio:hIni, horaFin:hFin, color }) });
      } else {
        await Promise.all(dias.map(dia => apiFetch(`${BACKEND}/api/rutinas`, { method:"POST", body:JSON.stringify({ nombre:nombre.trim(), diaSemana:dia, horaInicio:hIni, horaFin:hFin, color }) })));
      }
      onGuardado();
    } catch { setError("Error de conexión."); setFase("form"); } finally { setG(false); }
  }

  return (
    <Overlay onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{...estiloModal,maxWidth:480}}>
        {fase==="form" && <>
          <h3 style={estiloTituloModal}>{esEdicion?"Editar rutina":"Nueva rutina"}</h3>
          <Campo label="Nombre"><input autoFocus value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej: Clase de matemáticas" style={estiloInput} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/></Campo>
          {!esEdicion&&<Campo label="Días de la semana"><div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {DIAS_LABELS.map((d,i)=><button key={i} onClick={()=>toggleDia(i)} style={{padding:"5px 10px",borderRadius:6,border:"1.5px solid",cursor:"pointer",fontSize:12,fontWeight:500,borderColor:dias.includes(i)?"#4F46E5":"#E5E7EB",background:dias.includes(i)?"#EEF2FF":"#fff",color:dias.includes(i)?"#4F46E5":"#6B7280"}}>{d}</button>)}
          </div>
          {dias.length>1&&<p style={{fontSize:11,color:"#6B7280",margin:"6px 0 0"}}>Se crearán {dias.length} rutinas, una por día.</p>}
          </Campo>}
          <Campo label="Horario"><div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="time" value={hIni} onChange={e=>setHIni(e.target.value)} style={{...estiloInput,flex:1}} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/>
            <span style={{color:"#9CA3AF",flexShrink:0}}>→</span>
            <input type="time" value={hFin} onChange={e=>setHFin(e.target.value)} style={{...estiloInput,flex:1}} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/>
          </div></Campo>
          <Campo label="Color"><div style={{display:"flex",gap:10,alignItems:"center"}}>
            {COLORES_RUTINA.map(c=><button key={c} onClick={()=>setColor(c)} style={{width:color===c?32:26,height:color===c?32:26,borderRadius:"50%",background:c,border:"none",cursor:"pointer",boxShadow:color===c?`0 0 0 2px #fff, 0 0 0 4px ${c}`:"none",transition:"all 0.15s",flexShrink:0}}/>)}
          </div></Campo>
          {error&&<p style={{fontSize:13,color:"#EF4444",margin:"0 0 12px"}}>{error}</p>}
          <div style={{display:"flex",gap:10}}><button onClick={onCerrar} style={{...estiloBotonSecundario,flex:1}}>Cancelar</button><button onClick={guardar} disabled={guardando} style={{...estiloBotonPrimario,flex:2,background:color,opacity:guardando?0.7:1}}>{guardando?"Guardando…":esEdicion?"Guardar cambios":dias.length>1?`Crear ${dias.length} rutinas`:"Crear rutina"}</button></div>
        </>}
        {fase==="conflicto" && <PanelConflicto conflictos={conflictos} onSustituir={()=>setFase("confirmar")} onVolver={()=>setFase("form")} />}
        {fase==="confirmar" && <PanelConfirmar conflictos={conflictos} guardando={guardando} onConfirmar={()=>guardarDefinitivo(conflictos)} onVolver={()=>setFase("conflicto")} />}
      </div>
    </Overlay>
  );
}

const PCONFIG={alta:{label:"Alta",color:"#EF4444",bg:"#FEF2F2"},media:{label:"Media",color:"#D97706",bg:"#FFFBEB"},baja:{label:"Baja",color:"#059669",bg:"#F0FDF4"}};

function ModalTareaSimple({ slotInicial, tareaEditar, onCerrar, onGuardado, apiFetch, tareas, rutinas:_r, eventos }: { slotInicial:Slot|null; tareaEditar?:Tarea|null; onCerrar:()=>void; onGuardado:()=>void; apiFetch:(url:string,options?:RequestInit)=>Promise<Response>; tareas:Tarea[]; rutinas:Rutina[]; eventos:Evento[]; }) {
  const esEdicion = !!tareaEditar;
  const tareaP = tareaEditar ? parseTarea(tareaEditar) : null;
  const [titulo,setTitulo]=useState(tareaEditar?.titulo||"");
  const [fecha,setFecha]=useState(tareaEditar?(tareaEditar.fecha_vencimiento?.split("|")[0].split("T")[0]||""):(slotInicial?format(slotInicial.fecha,"yyyy-MM-dd"):format(new Date(),"yyyy-MM-dd")));
  const [hIni,setHIni]=useState(tareaP?.horaInicio||slotInicial?.hora||"");
  const [hFin,setHFin]=useState(tareaP?.horaFin||slotInicial?.horaFin||"");
  const [prior,setPrior]=useState<"baja"|"media"|"alta">(tareaEditar?.prioridad||"media");
  const [guardando,setG]=useState(false);
  const [error,setError]=useState("");
  const [conflictos,setConflictos]=useState<Conflicto[]>([]);
  const [fase,setFase]=useState<"form"|"conflicto"|"confirmar">("form");

  function detectar(): Conflicto[] {
    if (!hIni || !hFin) return [];
    const cs: Conflicto[] = [];
    tareas.forEach(t => {
      if (t.id === tareaEditar?.id) return;
      const p = parseTarea(t); if (!p?.horaInicio || !p?.horaFin) return;
      if (t.fecha_vencimiento!.split("|")[0].split("T")[0] === fecha && solapan(hIni, hFin, p.horaInicio, p.horaFin))
        cs.push({ tipo:"tarea", id:t.id, titulo:t.titulo });
    });
    eventos.forEach(e => {
      if (!e.horaInicio || !e.horaFin) return;
      if (e.fecha.slice(0,10) === fecha && solapan(hIni, hFin, e.horaInicio, e.horaFin))
        cs.push({ tipo:"evento", id:e.id, titulo:e.titulo });
    });
    return cs;
  }

  async function guardar() {
    if (!titulo.trim()) { setError("El título es obligatorio."); return; }
    if (hIni && !hFin) { setError("Añade una hora de fin."); return; }
    if (hIni && hFin && hFin <= hIni) { setError("La hora de fin debe ser posterior a la de inicio."); return; }
    const cs = detectar();
    if (cs.length > 0) { setConflictos(cs); setFase("conflicto"); return; }
    await guardarDefinitivo([]);
  }

  async function guardarDefinitivo(eliminar: Conflicto[]) {
    setG(true);
    try {
      await Promise.all(eliminar.map(c => apiFetch(`${BACKEND}/api/${c.tipo==="evento"?"eventos":"tareas"}/${c.id}`, { method:"DELETE" })));
      let fv=""; if(fecha&&hIni&&hFin) fv=`${fecha}T${hIni}:00|${hFin}`; else if(fecha&&hIni) fv=`${fecha}T${hIni}:00`; else if(fecha) fv=`${fecha}T00:00:00`;
      const body = JSON.stringify({ titulo:titulo.trim(), prioridad:prior, fecha_vencimiento:fv });
      const res = esEdicion
        ? await apiFetch(`${BACKEND}/api/tareas/${tareaEditar!.id}`, { method:"PUT", body })
        : await apiFetch(`${BACKEND}/api/tareas`, { method:"POST", body });
      if (!res.ok) { setError("Error al guardar."); setFase("form"); return; }
      onGuardado();
    } catch { setError("Error de conexión."); setFase("form"); } finally { setG(false); }
  }

  return (
    <Overlay onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={estiloModal}>
        {fase==="form" && <>
          <h3 style={estiloTituloModal}>{esEdicion?"Editar tarea":"Nueva tarea"}</h3>
          <Campo label="Título"><input autoFocus value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="¿Qué necesitas hacer?" style={estiloInput} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/></Campo>
          <Campo label="Fecha límite"><input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={estiloInput} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/></Campo>
          <Campo label="Horario"><div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="time" value={hIni} onChange={e=>setHIni(e.target.value)} style={{...estiloInput,flex:1}} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/>
            <span style={{color:"#9CA3AF",flexShrink:0}}>→</span>
            <input type="time" value={hFin} onChange={e=>setHFin(e.target.value)} style={{...estiloInput,flex:1}} onFocus={e=>(e.currentTarget.style.borderColor="#6366F1")} onBlur={e=>(e.currentTarget.style.borderColor="#E5E7EB")}/>
          </div>
          {hIni&&!hFin&&<p style={{fontSize:11,color:"#D97706",margin:"5px 0 0"}}>Añade hora de fin para activar la detección automática</p>}
          </Campo>
          <Campo label="Prioridad"><div style={{display:"flex",gap:6}}>
            {(["baja","media","alta"] as const).map(p=><button key={p} onClick={()=>setPrior(p)} style={{flex:1,padding:"8px 0",border:"1.5px solid",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,borderColor:prior===p?PCONFIG[p].color:"#E5E7EB",background:prior===p?PCONFIG[p].bg:"#fff",color:prior===p?PCONFIG[p].color:"#9CA3AF"}}>{PCONFIG[p].label}</button>)}
          </div></Campo>
          {error&&<p style={{fontSize:13,color:"#EF4444",margin:"0 0 12px"}}>{error}</p>}
          <div style={{display:"flex",gap:10}}><button onClick={onCerrar} style={{...estiloBotonSecundario,flex:1}}>Cancelar</button><button onClick={guardar} disabled={guardando} style={{...estiloBotonPrimario,flex:2,opacity:guardando?0.7:1}}>{guardando?"Guardando…":esEdicion?"Guardar cambios":"Crear tarea"}</button></div>
        </>}
        {fase==="conflicto" && <PanelConflicto conflictos={conflictos} onSustituir={()=>setFase("confirmar")} onVolver={()=>setFase("form")} />}
        {fase==="confirmar" && <PanelConfirmar conflictos={conflictos} guardando={guardando} onConfirmar={()=>guardarDefinitivo(conflictos)} onVolver={()=>setFase("conflicto")} />}
      </div>
    </Overlay>
  );
}

const TIPO_LABEL: Record<string,string> = { rutina:"Rutina", tarea:"Tarea", evento:"Evento" };

function PanelConflicto({ conflictos, onSustituir, onVolver }: { conflictos:Conflicto[]; onSustituir:()=>void; onVolver:()=>void; }) {
  return <>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
      <div style={{width:40,height:40,borderRadius:"50%",background:"#FEF3C7",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div>
        <h3 style={{fontSize:16,fontWeight:700,color:"#1A1A1A",margin:0}}>Conflicto de horario</h3>
        <p style={{fontSize:13,color:"#6B7280",margin:"2px 0 0"}}>Ya hay {conflictos.length===1?"algo":"cosas"} programado en ese horario</p>
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20}}>
      {conflictos.map(c=>(
        <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FED7AA"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#EA580C",background:"#FFEDD5",padding:"2px 8px",borderRadius:99,flexShrink:0}}>{TIPO_LABEL[c.tipo]}</span>
          <span style={{fontSize:14,fontWeight:500,color:"#1A1A1A"}}>{c.titulo}</span>
        </div>
      ))}
    </div>
    <p style={{fontSize:13,color:"#6B7280",margin:"0 0 16px"}}>¿Quieres sustituirlo?</p>
    <div style={{display:"flex",gap:10}}>
      <button onClick={onVolver} style={{...estiloBotonSecundario,flex:1}}>Volver</button>
      <button onClick={onSustituir} style={{...estiloBotonPrimario,flex:2,background:"#D97706"}}>Sustituir</button>
    </div>
  </>;
}

function PanelConfirmar({ conflictos, guardando, onConfirmar, onVolver }: { conflictos:Conflicto[]; guardando:boolean; onConfirmar:()=>void; onVolver:()=>void; }) {
  return <>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
      <div style={{width:40,height:40,borderRadius:"50%",background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </div>
      <div>
        <h3 style={{fontSize:16,fontWeight:700,color:"#1A1A1A",margin:0}}>¿Estás seguro?</h3>
        <p style={{fontSize:13,color:"#6B7280",margin:"2px 0 0"}}>Esta acción no se puede deshacer</p>
      </div>
    </div>
    <p style={{fontSize:13,color:"#374151",margin:"0 0 10px"}}>Se eliminarán los siguientes elementos:</p>
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20}}>
      {conflictos.map(c=>(
        <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#EF4444",background:"#FEE2E2",padding:"2px 8px",borderRadius:99,flexShrink:0}}>{TIPO_LABEL[c.tipo]}</span>
          <span style={{fontSize:14,fontWeight:500,color:"#1A1A1A"}}>{c.titulo}</span>
        </div>
      ))}
    </div>
    <div style={{display:"flex",gap:10}}>
      <button onClick={onVolver} disabled={guardando} style={{...estiloBotonSecundario,flex:1}}>Cancelar</button>
      <button onClick={onConfirmar} disabled={guardando} style={{...estiloBotonPrimario,flex:2,background:"#EF4444",opacity:guardando?0.7:1}}>{guardando?"Eliminando…":"Sí, sustituir"}</button>
    </div>
  </>;
}

function Overlay({children,onClick}:{children:React.ReactNode;onClick:()=>void}){return<div onClick={onClick} style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>{children}</div>;}
function Campo({label,children}:{label:string;children:React.ReactNode}){return<div style={{marginBottom:14}}><label style={estiloLabel}>{label}</label>{children}</div>;}
function Punto({color}:{color:string}){return<span style={{width:7,height:7,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0}}/>;}
function BtnNav({children,onClick,style}:{children:React.ReactNode;onClick:()=>void;style?:React.CSSProperties}){
  return<button onClick={onClick} style={{background:"#fff",border:`1px solid ${COLOR_LINEA2}`,borderRadius:8,padding:"6px 8px",cursor:"pointer",color:"#6B7280",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",...style}} onMouseEnter={e=>{e.currentTarget.style.background="#F3F4F6";}} onMouseLeave={e=>{e.currentTarget.style.background="#fff";}}>{children}</button>;
}

const estiloModal:React.CSSProperties={background:"#fff",borderRadius:16,padding:"28px 24px 24px",width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,0.15)",margin:"0 16px",maxHeight:"90vh",overflowY:"auto"};
const estiloTituloModal:React.CSSProperties={fontSize:18,fontWeight:700,color:"#1A1A1A",margin:"0 0 20px"};
const estiloLabel:React.CSSProperties={display:"block",fontSize:12,fontWeight:600,color:"#6B7280",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"};
const estiloInput:React.CSSProperties={width:"100%",padding:"11px 13px",border:"1.5px solid #E5E7EB",borderRadius:10,fontSize:14,color:"#1A1A1A",outline:"none",boxSizing:"border-box",background:"#fff",fontFamily:"inherit"};
const estiloBotonPrimario:React.CSSProperties={padding:"10px 20px",borderRadius:10,background:"#4F46E5",color:"#fff",border:"none",cursor:"pointer",fontSize:14,fontWeight:600};
const estiloBotonSecundario:React.CSSProperties={padding:"10px 20px",borderRadius:10,background:"#F3F4F6",color:"#6B7280",border:"none",cursor:"pointer",fontSize:14,fontWeight:600};