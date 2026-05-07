"use client";
import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import BotonNuevaTarea from "./components/BotonNuevaTarea";

interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  completado: boolean;
  fecha_vencimiento: string | null;
  prioridad: "baja" | "media" | "alta";
  creadoEn: string;
}

interface Rutina {
  id: number;
  titulo: string;
  horaInicio: string;
  horaFin: string;
  categoria: string;
  color: string;
}

const BACKEND = "http://localhost:3000";

const PRIORIDAD_CONFIG = {
  alta:  { label: "Alta",  color: "#EF4444", bg: "#FEF2F2", dot: "#EF4444" },
  media: { label: "Media", color: "#D97706", bg: "#FFFBEB", dot: "#D97706" },
  baja:  { label: "Baja",  color: "#059669", bg: "#F0FDF4", dot: "#059669" },
};

const RUTINAS_HOY: Rutina[] = [
  { id: 1, titulo: "Clase de Cálculo", horaInicio: "09:00", horaFin: "11:00", categoria: "Universidad", color: "#6366F1" },
  { id: 2, titulo: "Almuerzo", horaInicio: "13:00", horaFin: "14:00", categoria: "Personal", color: "#059669" },
  { id: 3, titulo: "Práctica de Programación", horaInicio: "16:00", horaFin: "18:00", categoria: "Universidad", color: "#6366F1" },
];

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

function formatDeadline(tarea: Tarea): string {
  if (!tarea.fecha_vencimiento) return "";
  const { fechaBase, horaInicio, horaFin } = parseTarea(tarea);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const targetDia = new Date(fechaBase); targetDia.setHours(0, 0, 0, 0);
  const diff = Math.ceil((targetDia.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  let diaStr = "";
  if (diff < 0) diaStr = `Venció hace ${Math.abs(diff)}d`;
  else if (diff === 0) diaStr = "Hoy";
  else if (diff === 1) diaStr = "Mañana";
  else if (diff <= 7) diaStr = `En ${diff} días`;
  else diaStr = fechaBase.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  if (horaInicio && horaFin) return `${diaStr} · ${horaInicio}–${horaFin}`;
  if (horaInicio) return `${diaStr} · ${horaInicio}`;
  return diaStr;
}

function isOverdue(tarea: Tarea): boolean {
  if (!tarea.fecha_vencimiento) return false;
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
  return fechaBase < new Date(hoy.toDateString());
}

function isPeriodoPasadoHoy(tarea: Tarea): boolean {
  if (!tarea.fecha_vencimiento || tarea.completado) return false;
  const { fechaBase, horaFin } = parseTarea(tarea);
  const ahora = new Date();
  const esHoy = fechaBase.toDateString() === ahora.toDateString();
  if (!esHoy) return false;

  if (horaFin) {
    const [hh, mm] = horaFin.split(":").map(Number);
    const finDate = new Date(fechaBase);
    finDate.setHours(hh, mm, 0, 0);
    return finDate < ahora;
  }
  return false;
}

function getHoraActual(): string {
  return new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function getRutinaActual(rutinas: Rutina[]): Rutina | null {
  const ahora = getHoraActual();
  return rutinas.find(r => r.horaInicio <= ahora && ahora <= r.horaFin) || null;
}

export default function Home() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState<Tarea | null>(null);
  const [editarTarea, setEditarTarea] = useState<Tarea | null>(null);
  const [horaActual, setHoraActual] = useState(getHoraActual());
  const [toastTarea, setToastTarea] = useState<Tarea | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastSnoozed, setToastSnoozed] = useState<string[]>([]);

  const [formTitulo, setFormTitulo] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formPrioridad, setFormPrioridad] = useState<"baja" | "media" | "alta">("media");
  const [formFecha, setFormFecha] = useState("");
  const [formHoraInicio, setFormHoraInicio] = useState("");
  const [formHoraFin, setFormHoraFin] = useState("");

  const hoy = new Date();
  const hora = hoy.getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const fecha = hoy.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  useEffect(() => { cargarTareas(); }, []);

  useEffect(() => {
    const interval = setInterval(() => setHoraActual(getHoraActual()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tareas.length === 0 || toastVisible) return;
    const candidatas = tareas.filter(t =>
      isPeriodoPasadoHoy(t) && !toastSnoozed.includes(t.id)
    );
    if (candidatas.length > 0) {
      setToastTarea(candidatas[0]);
      setToastVisible(true);
    }
  }, [tareas, horaActual]);

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

  async function cargarTareas() {
    setCargando(true);
    const res = await apiFetch(`${BACKEND}/api/tareas`);
    const data = await res.json();
    setTareas(Array.isArray(data) ? data : []);
    setCargando(false);
  }

  function buildFechaVencimiento(fecha: string, horaInicio: string, horaFin: string): string {
    if (!fecha) return "";
    if (horaInicio && horaFin) return `${fecha}T${horaInicio}:00|${horaFin}`;
    if (horaInicio) return `${fecha}T${horaInicio}:00`;
    return `${fecha}T00:00:00`;
  }

  async function crearTarea(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitulo.trim() || !formFecha) return;
    const fecha_vencimiento = buildFechaVencimiento(formFecha, formHoraInicio, formHoraFin);
    await apiFetch(`${BACKEND}/api/tareas`, {
      method: "POST",
      body: JSON.stringify({ titulo: formTitulo, descripcion: formDescripcion || null, prioridad: formPrioridad, fecha_vencimiento }),
    });
    resetForm();
    setMostrarModal(false);
    cargarTareas();
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
    resetForm();
    cargarTareas();
  }

  async function completarTarea(id: string, completado: boolean) {
    await apiFetch(`${BACKEND}/api/tareas/${id}`, {
      method: "PUT",
      body: JSON.stringify({ completado: !completado }),
    });
    cargarTareas();
  }

  async function eliminarTarea(id: string) {
    await apiFetch(`${BACKEND}/api/tareas/${id}`, { method: "DELETE" });
    setConfirmarEliminar(null);
    cargarTareas();
  }

  function resetForm() {
    setFormTitulo(""); setFormDescripcion(""); setFormPrioridad("media");
    setFormFecha(""); setFormHoraInicio(""); setFormHoraFin("");
  }

  function abrirEditar(tarea: Tarea) {
    setEditarTarea(tarea);
    setFormTitulo(tarea.titulo);
    setFormDescripcion(tarea.descripcion || "");
    setFormPrioridad(tarea.prioridad);
    if (tarea.fecha_vencimiento) {
      const { fechaBase, horaInicio, horaFin } = parseTarea(tarea);
      setFormFecha(tarea.fecha_vencimiento.split("T")[0]);
      setFormHoraInicio(horaInicio || "");
      setFormHoraFin(horaFin || "");
    } else {
      setFormFecha(""); setFormHoraInicio(""); setFormHoraFin("");
    }
  }

  function cerrarToast() {
    setToastVisible(false);
    setTimeout(() => setToastTarea(null), 300);
  }

  function snoozeToast() {
    if (toastTarea) setToastSnoozed(prev => [...prev, toastTarea.id]);
    cerrarToast();
  }

  async function confirmarToast() {
    if (toastTarea) {
      await completarTarea(toastTarea.id, false);
    }
    cerrarToast();
  }

  const esHoy = (tarea: Tarea) => {
    if (!tarea.fecha_vencimiento) return false;
    const fecha = new Date(tarea.fecha_vencimiento.split("|")[0].split("T")[0]);
    const hoy = new Date();
    return fecha.toDateString() === hoy.toDateString();
  };

  const pendientes = tareas.filter(t => !t.completado && esHoy(t));
  const completadas = tareas.filter(t => t.completado && esHoy(t));

  const totalHoy = pendientes.length + completadas.length;
  const progreso = totalHoy > 0 ? Math.round((completadas.length / totalHoy) * 100) : 0;

  const heroTarea = pendientes.find(t => t.prioridad === "alta" && isOverdue(t))
    || pendientes.find(t => t.prioridad === "alta" && t.fecha_vencimiento && formatDeadline(t) === "Hoy")
    || pendientes.find(t => t.prioridad === "alta")
    || pendientes[0];

  const restasPendientes = pendientes.filter(t => t.id !== heroTarea?.id);
  const rutinaActual = getRutinaActual(RUTINAS_HOY);

  return (
    <div style={{ background: "#FAFAF9", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{fecha}</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1A1A1A", margin: "0 0 4px", letterSpacing: "-0.5px" }}>
              {saludo}{user?.firstName ? `, ${user.firstName}` : user?.username ? `, ${user.username}` : ""}
            </h1>
            <span style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>{horaActual}</span>
          </div>
          {tareas.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{completadas.length}/{totalHoy} completadas</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: progreso === 100 ? "#059669" : "#6B7280" }}>{progreso}%</span>
              </div>
              <div style={{ height: 4, background: "#E5E7EB", borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${progreso}%`, background: progreso === 100 ? "#059669" : "#6366F1", borderRadius: 99, transition: "width 0.5s ease" }} />
              </div>
            </div>
          )}
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 24, alignItems: "start" }}>

          {/* Columna izquierda */}
          <div>
            <button
              onClick={() => { setEditarTarea(null); resetForm(); setMostrarModal(true); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF", border: "1.5px dashed #D1D5DB", borderRadius: 14, padding: "12px 16px", cursor: "pointer", marginBottom: 20, transition: "border-color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#D1D5DB")}
            >
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 500 }}>Añadir tarea...</span>
            </button>

            {cargando ? (
              <p style={{ textAlign: "center", color: "#9CA3AF", padding: "40px 0", fontSize: 14 }}>Cargando...</p>
            ) : pendientes.length === 0 && completadas.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <p style={{ fontSize: 40, marginBottom: 12 }}>✦</p>
                <p style={{ color: "#6B7280", fontSize: 15, fontWeight: 500 }}>Día despejado</p>
                <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 4 }}>Añade tu primera tarea</p>
              </div>
            ) : (
              <>
                {heroTarea && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                      {heroTarea.prioridad === "alta" ? "🔴 Prioridad alta" : "Próxima tarea"}
                    </p>
                    <HeroTarea tarea={heroTarea} onCompletar={completarTarea} onEliminar={setConfirmarEliminar} onEditar={abrirEditar} />
                  </div>
                )}
                {restasPendientes.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Pendientes</p>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      {restasPendientes.map(t => (
                        <TareaItem key={t.id} tarea={t} onCompletar={completarTarea} onEliminar={setConfirmarEliminar} onEditar={abrirEditar} />
                      ))}
                    </ul>
                  </div>
                )}
                {completadas.length > 0 && (
                  <CompletadasSection tareas={completadas} onCompletar={completarTarea} onEliminar={setConfirmarEliminar} onEditar={abrirEditar} />
                )}
              </>
            )}
          </div>

          {/* Columna derecha */}
          <div style={{ position: "sticky", top: 24 }}>
            {rutinaActual && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Ahora</p>
                <div style={{ background: "#1A1A1A", borderRadius: 14, padding: "16px", border: "1px solid #374151" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: rutinaActual.color, display: "inline-block" }} />
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>{rutinaActual.categoria}</span>
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", margin: "0 0 4px" }}>{rutinaActual.titulo}</p>
                  <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{rutinaActual.horaInicio} – {rutinaActual.horaFin}</p>
                </div>
              </div>
            )}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Rutinas de hoy</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {RUTINAS_HOY.map(rutina => {
                  const esActual = rutinaActual?.id === rutina.id;
                  const esPasada = rutina.horaFin < horaActual;
                  return (
                    <div key={rutina.id} style={{
                      background: "#FFFFFF",
                      border: `0.5px solid ${esActual ? rutina.color : "#E5E7EB"}`,
                      borderLeft: `3px solid ${esPasada ? "#E5E7EB" : rutina.color}`,
                      borderRadius: "0 10px 10px 0", padding: "10px 12px",
                      opacity: esPasada ? 0.5 : 1, transition: "all 0.2s",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: esPasada ? "#9CA3AF" : "#1A1A1A" }}>{rutina.titulo}</span>
                        {esActual && <span style={{ fontSize: 10, fontWeight: 700, color: rutina.color, background: `${rutina.color}15`, padding: "2px 7px", borderRadius: 99 }}>Ahora</span>}
                      </div>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0" }}>{rutina.horaInicio} – {rutina.horaFin}</p>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: "#D1D5DB", marginTop: 12, textAlign: "center", fontStyle: "italic" }}>Rutinas reales próximamente</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastTarea && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 60,
          background: "#FFFFFF", borderRadius: 14, padding: "16px 18px",
          width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          border: "0.5px solid #E5E7EB",
          transform: toastVisible ? "translateY(0)" : "translateY(120%)",
          opacity: toastVisible ? 1 : 0,
          transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366F1", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>Tarea pasada</span>
            <button onClick={cerrarToast} style={{ background: "none", border: "none", cursor: "pointer", color: "#D1D5DB", fontSize: 16, lineHeight: 1, padding: 2 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#6B7280")}
              onMouseLeave={e => (e.currentTarget.style.color = "#D1D5DB")}
            >✕</button>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 3px", lineHeight: 1.3 }}>
            {toastTarea.titulo}
          </p>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 14px" }}>
            {formatDeadline(toastTarea)} · el periodo ya terminó
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={confirmarToast}
              style={{ flex: 1, background: "#059669", color: "#FFFFFF", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#047857")}
              onMouseLeave={e => (e.currentTarget.style.background = "#059669")}
            >✓ Completada</button>
            <button
              onClick={snoozeToast}
              style={{ flex: 1, background: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#E5E7EB")}
              onMouseLeave={e => (e.currentTarget.style.background = "#F3F4F6")}
            >Aún no</button>
          </div>
        </div>
      )}

      {/* Modal crear */}
      {mostrarModal && (
        <ModalTarea
          titulo="Nueva tarea" boton="Crear tarea"
          formTitulo={formTitulo} setFormTitulo={setFormTitulo}
          formDescripcion={formDescripcion} setFormDescripcion={setFormDescripcion}
          formPrioridad={formPrioridad} setFormPrioridad={setFormPrioridad}
          formFecha={formFecha} setFormFecha={setFormFecha}
          formHoraInicio={formHoraInicio} setFormHoraInicio={setFormHoraInicio}
          formHoraFin={formHoraFin} setFormHoraFin={setFormHoraFin}
          onSubmit={crearTarea} onCerrar={() => setMostrarModal(false)}
        />
      )}

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
          onSubmit={actualizarTarea} onCerrar={() => setEditarTarea(null)}
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
      <BotonNuevaTarea
        fechaInicial={new Date().toISOString().split("T")[0]}
        onTareaCreada={cargarTareas}
      />
    </div>
    
  );
}

// ── MODAL TAREA ───────────────────────────────────────────────
function ModalTarea({ titulo, boton, formTitulo, setFormTitulo, formDescripcion, setFormDescripcion, formPrioridad, setFormPrioridad, formFecha, setFormFecha, formHoraInicio, setFormHoraInicio, formHoraFin, setFormHoraFin, onSubmit, onCerrar }: {
  titulo: string; boton: string;
  formTitulo: string; setFormTitulo: (v: string) => void;
  formDescripcion: string; setFormDescripcion: (v: string) => void;
  formPrioridad: "baja" | "media" | "alta"; setFormPrioridad: (v: "baja" | "media" | "alta") => void;
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
              onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Descripción</label>
            <textarea value={formDescripcion} onChange={e => setFormDescripcion(e.target.value)} placeholder="Notas adicionales..." rows={2}
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#1A1A1A", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fecha límite *</label>
            <input type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)} required
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#1A1A1A", outline: "none", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
              onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Periodo horario
              <span style={{ fontSize: 10, fontWeight: 400, color: "#D1D5DB", marginLeft: 6 }}>opcional</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="time" value={formHoraInicio} onChange={e => setFormHoraInicio(e.target.value)}
                style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "9px 10px", fontSize: 13, color: formHoraInicio ? "#1A1A1A" : "#9CA3AF", outline: "none", boxSizing: "border-box" }}
                onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
              />
              <span style={{ fontSize: 13, color: "#9CA3AF", flexShrink: 0 }}>→</span>
              <input type="time" value={formHoraFin} onChange={e => setFormHoraFin(e.target.value)}
                style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "9px 10px", fontSize: 13, color: formHoraFin ? "#1A1A1A" : "#9CA3AF", outline: "none", boxSizing: "border-box" }}
                onFocus={e => (e.currentTarget.style.borderColor = "#6366F1")}
                onBlur={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
              />
            </div>
            {formHoraInicio && !formHoraFin && (
              <p style={{ fontSize: 11, color: "#D97706", marginTop: 5 }}>Añade hora de fin para activar la detección automática</p>
            )}
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prioridad</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["baja", "media", "alta"] as const).map(p => (
                <button key={p} type="button" onClick={() => setFormPrioridad(p)}
                  style={{ flex: 1, padding: "9px 0", border: "1.5px solid", borderColor: formPrioridad === p ? PRIORIDAD_CONFIG[p].color : "#E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: formPrioridad === p ? PRIORIDAD_CONFIG[p].color : "#9CA3AF", background: formPrioridad === p ? PRIORIDAD_CONFIG[p].bg : "#FFFFFF", transition: "all 0.12s" }}>
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

// ── HERO TAREA ────────────────────────────────────────────────
function HeroTarea({ tarea, onCompletar, onEliminar, onEditar }: {
  tarea: Tarea;
  onCompletar: (id: string, completado: boolean) => void;
  onEliminar: (tarea: Tarea) => void;
  onEditar: (tarea: Tarea) => void;
}) {
  const [animando, setAnimando] = useState(false);
  const [hover, setHover] = useState(false);
  const vencida = isOverdue(tarea);
  const p = PRIORIDAD_CONFIG[tarea.prioridad];

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
        background: animando ? "#F0FDF4" : "#FFFFFF",
        borderRadius: "0 16px 16px 0", padding: "18px 18px 18px 16px",
        cursor: "pointer", userSelect: "none",
        border: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
        borderLeft: `4px solid ${animando ? "#059669" : hover ? p.dot : "#E5E7EB"}`,
        boxShadow: hover && !animando ? "0 8px 24px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.04)",
        transition: "all 0.4s ease",
        opacity: animando ? 0.4 : 1,
        transform: animando ? "scale(0.98)" : "scale(1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 2,
          border: `2px solid ${animando ? "#059669" : "#D1D5DB"}`,
          background: animando ? "#059669" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.3s ease",
        }}>
          {animando && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: animando ? "#9CA3AF" : "#1A1A1A", margin: "0 0 4px", letterSpacing: "-0.3px", lineHeight: 1.3, textDecoration: animando ? "line-through" : "none", transition: "all 0.4s ease" }}>
            {tarea.titulo}
          </p>
          {tarea.descripcion && (
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 8px", lineHeight: 1.4 }}>{tarea.descripcion}</p>
          )}
          <p style={{ fontSize: 12, color: vencida ? "#EF4444" : "#9CA3AF", margin: 0, fontWeight: vencida ? 600 : 400, opacity: animando ? 0 : 1, transition: "opacity 0.4s ease" }}>
            {tarea.fecha_vencimiento ? `${p.label} · ${formatDeadline(tarea)}` : p.label}
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onEditar(tarea); }}
            style={{ background: "none", border: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, cursor: "pointer", color: hover ? "#6B7280" : "#D1D5DB", fontSize: 13, padding: "5px 9px", borderRadius: 6, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#6366F1"; e.currentTarget.style.borderColor = "#C7D2FE"; e.currentTarget.style.background = "#EEF2FF"; }}
            onMouseLeave={e => { e.currentTarget.style.color = hover ? "#6B7280" : "#D1D5DB"; e.currentTarget.style.borderColor = hover ? "#D1D5DB" : "#E5E7EB"; e.currentTarget.style.background = "none"; }}
          >✎ Editar</button>
          <button onClick={e => { e.stopPropagation(); onEliminar(tarea); }}
            style={{ background: "none", border: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, cursor: "pointer", color: hover ? "#6B7280" : "#D1D5DB", fontSize: 13, padding: "5px 9px", borderRadius: 6, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.background = "#FEF2F2"; }}
            onMouseLeave={e => { e.currentTarget.style.color = hover ? "#6B7280" : "#D1D5DB"; e.currentTarget.style.borderColor = hover ? "#D1D5DB" : "#E5E7EB"; e.currentTarget.style.background = "none"; }}
          >✕</button>
        </div>
      </div>
    </div>
  );
}

// ── TAREA NORMAL ──────────────────────────────────────────────
function TareaItem({ tarea, onCompletar, onEliminar, onEditar }: {
  tarea: Tarea;
  onCompletar: (id: string, completado: boolean) => void;
  onEliminar: (tarea: Tarea) => void;
  onEditar: (tarea: Tarea) => void;
}) {
  const [hover, setHover] = useState(false);
  const [animando, setAnimando] = useState(false);
  const p = PRIORIDAD_CONFIG[tarea.prioridad];
  const vencida = isOverdue(tarea) && !tarea.completado;

  function handleCompletar() {
    if (animando) return;
    setAnimando(true);
    setTimeout(() => { onCompletar(tarea.id, tarea.completado); setAnimando(false); }, 500);
  }

  return (
    <li
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleCompletar}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: animando ? "#F0FDF4" : "#FFFFFF",
        border: `0.5px solid ${animando ? "#BBF7D0" : hover ? "#D1D5DB" : "#E5E7EB"}`,
        borderLeft: `3px solid ${animando ? "#059669" : tarea.completado ? "#E5E7EB" : hover ? p.dot : "#E5E7EB"}`,
        borderRadius: "0 12px 12px 0", padding: "11px 14px",
        cursor: "pointer", userSelect: "none",
        transition: "all 0.4s ease",
        opacity: animando ? 0.3 : tarea.completado ? 0.5 : 1,
        transform: animando ? "scale(0.97)" : "scale(1)",
        boxShadow: hover && !animando ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
      }}
    >
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500, display: "block", color: tarea.completado || animando ? "#9CA3AF" : "#1A1A1A", textDecoration: tarea.completado || animando ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "all 0.4s ease" }}>
          {tarea.titulo}
        </span>
        <p style={{ fontSize: 12, color: vencida ? "#EF4444" : "#9CA3AF", margin: "3px 0 0", fontWeight: vencida ? 600 : 400, opacity: animando ? 0 : 1, transition: "opacity 0.4s ease" }}>
          {tarea.fecha_vencimiento ? `${p.label} · ${formatDeadline(tarea)}` : p.label}
        </p>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); onEditar(tarea); }}
          style={{ background: "none", border: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, cursor: "pointer", color: hover ? "#6B7280" : "#D1D5DB", fontSize: 13, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#6366F1"; e.currentTarget.style.borderColor = "#C7D2FE"; e.currentTarget.style.background = "#EEF2FF"; }}
          onMouseLeave={e => { e.currentTarget.style.color = hover ? "#6B7280" : "#D1D5DB"; e.currentTarget.style.borderColor = hover ? "#D1D5DB" : "#E5E7EB"; e.currentTarget.style.background = "none"; }}
        >✎ Editar</button>
        <button onClick={e => { e.stopPropagation(); onEliminar(tarea); }}
          style={{ background: "none", border: `0.5px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, cursor: "pointer", color: hover ? "#6B7280" : "#D1D5DB", fontSize: 13, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.background = "#FEF2F2"; }}
          onMouseLeave={e => { e.currentTarget.style.color = hover ? "#6B7280" : "#D1D5DB"; e.currentTarget.style.borderColor = hover ? "#D1D5DB" : "#E5E7EB"; e.currentTarget.style.background = "none"; }}
        >✕</button>
      </div>
    </li>
  );
}

// ── COMPLETADAS ───────────────────────────────────────────────
function CompletadasSection({ tareas, onCompletar, onEliminar, onEditar }: {
  tareas: Tarea[];
  onCompletar: (id: string, completado: boolean) => void;
  onEliminar: (tarea: Tarea) => void;
  onEditar: (tarea: Tarea) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section>
      <button onClick={() => setAbierto(!abierto)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: abierto ? 10 : 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" style={{ transform: abierto ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>Completadas</span>
        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: "1px 8px", color: "#059669", background: "#F0FDF4" }}>{tareas.length}</span>
      </button>
      {abierto && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {tareas.map(t => <TareaItem key={t.id} tarea={t} onCompletar={onCompletar} onEliminar={onEliminar} onEditar={onEditar} />)}
        </ul>
      )}
    </section>
  );
}