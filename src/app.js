const express = require('express');
const cors = require('cors');

const app = express();

// CORS más permisivo para desarrollo
app.use(cors({
  origin: [
    "https://gestionar-carrera-frontend-g4ay0abwd-jose-cossios-projects.vercel.app", // dominio de Vercel
    "http://localhost:5173", // (si usas Vite en desarrollo)
    "http://localhost:10000", // (si usas CRA en desarrollo)
    "https://doblesanroque.vercel.app",
    "http://localhost:3000",  // (si usas CRA en desarrollo)
    "http://localhost:3000",
    "https://total360sport.com",
    "https://www.total360sport.com"

  ],
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
// Middleware para parsear JSON
app.use(express.json());

// Middleware para logging de requests (temporal para debug)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Importar la ruta de prueba
const testRoutes = require('./routes/TestRoutes');
app.use('/api', testRoutes);

// Importar y usar las rutas de autenticación
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// Importar y usar las rutas de inscripción
const inscripcionRoutes = require('./routes/inscripcionRoutes');
app.use('/api/inscripciones', inscripcionRoutes);

// Importar y usar las rutas de tiempo
const tiempoRoutes = require('./routes/tiempoRoutes');
app.use('/api/tiempos', tiempoRoutes);

// Importar y usar las rutas de categorías
const categoriaRoutes = require('./routes/categoriaRoutes');
app.use('/api/categorias', categoriaRoutes);

// Importar y usar las rutas de etapas
const etapaRoutes = require('./routes/etapaRoutes');
app.use('/api/etapas', etapaRoutes);

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Server is running'
  });
});

module.exports = app;