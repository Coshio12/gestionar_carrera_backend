const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Ruta de login
router.post('/login', authController.login);

// Ruta de registro (opcional)
router.post('/register', authController.register);

// Ruta para verificar token - cambiado de verifyToken a me
router.get('/me', authController.authenticateToken, authController.me);

module.exports = router;