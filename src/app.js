const express = require('express');
const cors = require('cors');

const app = express();

// CORS más permisivo para desarrollo
app.use(cors({
  origin: [
    "https://gestionar-carrera-frontend-g4ay0abwd-jose-cossios-projects.vercel.app",
    "http://localhost:5173",
    "http://localhost:10000", 
    "https://doblesanroque.vercel.app",
    "http://localhost:3000",
    "https://total360sport.com",
    "https://doblechaguaya.total360sport.com",
    "https://www.total360sport.com"
  ],
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// Middleware para logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Importar las rutas
const testRoutes = require('./routes/TestRoutes');
const authRoutes = require('./routes/authRoutes');
const inscripcionRoutes = require('./routes/inscripcionRoutes');
const tiempoRoutes = require('./routes/tiempoRoutes');
const categoriaRoutes = require('./routes/categoriaRoutes');
const etapaRoutes = require('./routes/etapaRoutes');
const publicRoutes = require('./routes/publicRoutes'); // NUEVO

// Configurar las rutas
app.use('/api', testRoutes);
app.use('/api/public', publicRoutes); // NUEVO - Rutas públicas SIN autenticación
app.use('/api/auth', authRoutes);
app.use('/api/inscripciones', inscripcionRoutes);
app.use('/api/tiempos', tiempoRoutes);
app.use('/api/categorias', categoriaRoutes);
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