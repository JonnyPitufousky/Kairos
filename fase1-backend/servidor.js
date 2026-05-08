require('dotenv').config()
const cors = require('cors');

const express = require('express')
const prisma = require('./db')
const { clerkMiddleware, requireAuth } = require('./middleware/auth')

const app = express()
app.use(cors({ origin: 'http://localhost:3007' }));
app.use(express.json())
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'ChangeME API running' })
})
app.use(clerkMiddleware()) // ← add this, processes Clerk tokens on every request


// TAREAS
app.get('/api/tareas', requireAuth, async (req, res) => {
  console.log('userId:', req.userId);
  try {
    const tareas = await prisma.tarea.findMany({
      where: { userId: req.userId },
      orderBy: { creadoEn: 'desc' }
    })
    res.json(tareas)
  } catch (error) {
    console.log('ERROR:', error.message);
    res.status(500).json({ error: 'Error al obtener tareas' })
  }
})

app.get('/api/tareas/:id', requireAuth, async (req, res) => {
  try {
    const tarea = await prisma.tarea.findFirst({
      where: { id: req.params.id, userId: req.userId }  // ← can't access other users' tasks
    })
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
    res.json(tarea)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener tarea' })
  }
})

app.post('/api/tareas', requireAuth, async (req, res) => {
  try {
    const { titulo, descripcion, prioridad, fecha_vencimiento } = req.body
    if (!titulo) return res.status(400).json({ error: 'El título es requerido' })

    const tarea = await prisma.tarea.create({
      data: {
        titulo,
        descripcion: descripcion || null,
        prioridad: prioridad || 'media',
        fecha_vencimiento: fecha_vencimiento || null,
        userId: req.userId  // ← real Clerk user ID
      }
    })
    res.status(201).json(tarea)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear tarea' })
  }
})

app.put('/api/tareas/:id', requireAuth, async (req, res) => {
  try {
    const { titulo, descripcion, completado, prioridad, fecha_vencimiento } = req.body

    const tarea = await prisma.tarea.update({
      where: { id: req.params.id, userId: req.userId },  // ← security check
      data: {
        ...(titulo !== undefined && { titulo }),
        ...(descripcion !== undefined && { descripcion }),
        ...(completado !== undefined && { completado }),
        ...(prioridad !== undefined && { prioridad }),
        ...(fecha_vencimiento !== undefined && { fecha_vencimiento })
      }
    })
    res.json(tarea)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    res.status(500).json({ error: 'Error al actualizar tarea' })
  }
})

app.delete('/api/tareas/:id', requireAuth, async (req, res) => {
  try {
    const tarea = await prisma.tarea.delete({
      where: { id: req.params.id, userId: req.userId }  // ← security check
    })
    res.json(tarea)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    res.status(500).json({ error: 'Error al eliminar tarea' })
  }
})

// RUTINAS
app.get('/api/rutinas', requireAuth, async (req, res) => {
  try {
    const rutinas = await prisma.rutina.findMany({
      where: { userId: req.userId },
      orderBy: { diaSemana: 'asc' }
    })
    res.json(rutinas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener rutinas' })
  }
})

app.post('/api/rutinas', requireAuth, async (req, res) => {
  try {
    const { nombre, diaSemana, horaInicio, horaFin, color } = req.body
    if (!nombre || diaSemana === undefined || !horaInicio || !horaFin) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }
    const rutina = await prisma.rutina.create({
      data: { nombre, diaSemana, horaInicio, horaFin, color: color || null, userId: req.userId }
    })
    res.status(201).json(rutina)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear rutina' })
  }
})

app.put('/api/rutinas/:id', requireAuth, async (req, res) => {
  try {
    const { nombre, diaSemana, horaInicio, horaFin, color } = req.body
    const rutina = await prisma.rutina.update({
      where: { id: req.params.id, userId: req.userId },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(diaSemana !== undefined && { diaSemana }),
        ...(horaInicio !== undefined && { horaInicio }),
        ...(horaFin !== undefined && { horaFin }),
        ...(color !== undefined && { color })
      }
    })
    res.json(rutina)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Rutina no encontrada' })
    res.status(500).json({ error: 'Error al actualizar rutina' })
  }
})

app.delete('/api/rutinas/:id', requireAuth, async (req, res) => {
  try {
    const rutina = await prisma.rutina.delete({
      where: { id: req.params.id, userId: req.userId }
    })
    res.json(rutina)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Rutina no encontrada' })
    res.status(500).json({ error: 'Error al eliminar rutina' })
  }
})

// OBJETIVOS
app.get('/api/objetivos', requireAuth, async (req, res) => {
  try {
    const objetivos = await prisma.objetivo.findMany({
      where: { userId: req.userId },
      orderBy: { creadoEn: 'desc' }
    })
    res.json(objetivos)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener objetivos' })
  }
})

app.post('/api/objetivos', requireAuth, async (req, res) => {
  try {
    const { nombre, tipo, deadline, meta, unidad, periodo } = req.body
    if (!nombre || !tipo) return res.status(400).json({ error: 'Faltan campos requeridos' })
    if (!['simple', 'avanzado'].includes(tipo)) return res.status(400).json({ error: 'Tipo de objetivo inválido' })
    const objetivo = await prisma.objetivo.create({
      data: {
        nombre, tipo,
        deadline: deadline || null,
        meta: meta || null,
        unidad: unidad || null,
        periodo: periodo || null,
        userId: req.userId
      }
    })
    res.status(201).json(objetivo)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear objetivo' })
  }
})

app.put('/api/objetivos/:id', requireAuth, async (req, res) => {
  try {
    const { nombre, deadline, meta, progreso, unidad, periodo } = req.body
    const objetivo = await prisma.objetivo.update({
      where: { id: req.params.id, userId: req.userId },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(deadline !== undefined && { deadline }),
        ...(meta !== undefined && { meta }),
        ...(progreso !== undefined && { progreso }),
        ...(unidad !== undefined && { unidad }),
        ...(periodo !== undefined && { periodo })
      }
    })
    res.json(objetivo)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Objetivo no encontrado' })
    res.status(500).json({ error: 'Error al actualizar objetivo' })
  }
})

app.delete('/api/objetivos/:id', requireAuth, async (req, res) => {
  try {
    const objetivo = await prisma.objetivo.delete({
      where: { id: req.params.id, userId: req.userId }
    })
    res.json(objetivo)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Objetivo no encontrado' })
    res.status(500).json({ error: 'Error al eliminar objetivo' })
  }
})

// EVENTOS
app.get('/api/eventos', requireAuth, async (req, res) => {
  try {
    const eventos = await prisma.evento.findMany({
      where: { userId: req.userId },
      orderBy: { fecha: 'asc' }
    })
    res.json(eventos)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener eventos' })
  }
})

app.post('/api/eventos', requireAuth, async (req, res) => {
  try {
    const { titulo, descripcion, fecha, horaInicio, horaFin } = req.body
    if (!titulo || !fecha) return res.status(400).json({ error: 'Faltan campos requeridos' })
    const evento = await prisma.evento.create({
      data: {
        titulo,
        descripcion: descripcion || null,
        fecha,
        horaInicio: horaInicio || null,
        horaFin: horaFin || null,
        userId: req.userId
      }
    })
    res.status(201).json(evento)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear evento' })
  }
})

app.delete('/api/eventos/:id', requireAuth, async (req, res) => {
  try {
    const evento = await prisma.evento.delete({
      where: { id: req.params.id, userId: req.userId }
    })
    res.json(evento)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Evento no encontrado' })
    res.status(500).json({ error: 'Error al eliminar evento' })
  }
})

// INICIAR SERVIDOR
const PORT = 3000
app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`)
})