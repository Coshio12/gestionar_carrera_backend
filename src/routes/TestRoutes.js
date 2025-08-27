const express = require('express');
const router = express.Router();

// Ruta de prueba
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register', 
        verify: 'GET /api/auth/verify'
      },
      inscripciones: {
        categorias: 'GET /api/inscripciones/categorias',
        equipos: 'GET /api/inscripciones/equipos',
        participantes: 'GET /api/inscripciones/participantes'
      }
    }
  });
});

module.exports = router;