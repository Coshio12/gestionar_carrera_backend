const express = require('express');
const router = express.Router();
const etapaController = require('../controllers/etapaController');
const { authenticateToken } = require('../controllers/authController');

// Rutas públicas
router.get('/', etapaController.getEtapas);
router.get('/:id', etapaController.getEtapaById);

// Rutas protegidas
router.post('/', authenticateToken, etapaController.createEtapa);
router.put('/:id', authenticateToken, etapaController.updateEtapa);
router.delete('/:id', authenticateToken, etapaController.deleteEtapa);

module.exports = router;