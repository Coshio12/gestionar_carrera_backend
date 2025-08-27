const express = require('express');
const router = express.Router();
const {
  getCategorias,
  createCategoria,
  getCategoriaById,
  updateCategoria,
  deleteCategoria
} = require('../controllers/categoriaController');

// Rutas para categorías
router.get('/', getCategorias);              // GET /api/categorias
router.post('/', createCategoria);           // POST /api/categorias
router.get('/:id', getCategoriaById);        // GET /api/categorias/:id
router.put('/:id', updateCategoria);         // PUT /api/categorias/:id
router.delete('/:id', deleteCategoria);      // DELETE /api/categorias/:id

module.exports = router;