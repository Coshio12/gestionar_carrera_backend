const express = require('express');
const multer = require('multer');
const router = express.Router();
const inscripcionController = require('../controllers/inscripcionController');
const { authenticateToken } = require('../controllers/authController');

// Configurar multer para manejo de archivos múltiples
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo por archivo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
});

// Rutas públicas
router.get('/categorias', inscripcionController.getCategorias);
router.get('/equipos', inscripcionController.getEquipos);

// RUTA PÚBLICA PARA INSCRIPCIÓN (actualizada para manejar múltiples archivos incluyendo autorización)
router.post('/participantes/publico', 
  (req, res, next) => {
    console.log('Llegó petición a /participantes/publico');
    next();
  },
  upload.fields([
    { name: 'comprobante', maxCount: 1 },
    { name: 'foto_anverso', maxCount: 1 },
    { name: 'foto_reverso', maxCount: 1 },
    { name: 'autorizacion', maxCount: 1 }
  ]), 
  (req, res, next) => {
    console.log('Files received:', req.files);
    console.log('Body received:', req.body);
    next();
  },
  inscripcionController.createParticipantePublico
);

// Rutas protegidas (admin)
router.get('/participantes', authenticateToken, inscripcionController.getParticipantes);
router.get('/participantes/:id', authenticateToken, inscripcionController.getParticipanteById);
router.get('/archivo/:path', authenticateToken, inscripcionController.getArchivoUrl);
router.post('/participantes', authenticateToken, inscripcionController.createParticipante);
router.put('/participantes/:id', authenticateToken, inscripcionController.updateParticipante);
router.delete('/participantes/:id', authenticateToken, inscripcionController.deleteParticipante);
router.get('/check-dorsal/:dorsal', authenticateToken, inscripcionController.checkDorsal);
router.post('/upload-archivos', 
  authenticateToken, 
  upload.fields([
    { name: 'comprobante', maxCount: 1 },
    { name: 'foto_anverso', maxCount: 1 },
    { name: 'foto_reverso', maxCount: 1 },
    { name: 'autorizacion', maxCount: 1 }
  ]), 
  inscripcionController.uploadArchivos
);

module.exports = router;