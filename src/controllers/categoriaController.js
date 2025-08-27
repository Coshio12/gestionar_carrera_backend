const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// Cliente normal para operaciones que requieren RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// Cliente admin para operaciones de inserción/actualización
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Obtener todas las categorías
const getCategorias = async (req, res) => {
  try {
    // Usar supabaseAdmin para asegurar que obtengamos todas las categorías
    const { data, error } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .order('nombre');

    if (error) {
      console.error('Error al obtener categorías:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error interno del servidor',
        error: error.message
      });
    }
    
    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error inesperado:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Crear una nueva categoría
const createCategoria = async (req, res) => {
  try {
    const { nombre, hora_salida } = req.body;
    
    console.log('=== CREAR CATEGORÍA ===');
    console.log('Body completo:', req.body);
    
    // Validaciones
    if (!nombre || !hora_salida) {
      return res.status(400).json({
        success: false,
        message: 'El nombre y la hora de salida son obligatorios'
      });
    }
    
    // Verificar si ya existe una categoría con el mismo nombre
    const { data: existingCategoria, error: checkError } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .eq('nombre', nombre.trim().toUpperCase())
      .maybeSingle(); // Usar maybeSingle en lugar de single

    if (checkError) {
      console.error('Error al verificar categoría:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
    
    if (existingCategoria) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una categoría con ese nombre'
      });
    }
    
    // Insertar nueva categoría usando supabaseAdmin
    const { data, error } = await supabaseAdmin
      .from('categorias')
      .insert([{ 
        nombre: nombre.trim().toUpperCase(), 
        hora_salida: hora_salida.trim() 
      }])
      .select()
      .single();

    if (error) {
      console.error('Error al crear categoría:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al crear la categoría',
        error: error.message
      });
    }
    
    console.log('Categoría creada exitosamente:', data);
    
    res.status(201).json({
      success: true,
      message: 'Categoría creada exitosamente',
      data
    });
  } catch (error) {
    console.error('Error inesperado:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Obtener una categoría por ID
const getCategoriaById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error al obtener categoría:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error inesperado:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Actualizar una categoría
const updateCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, hora_salida } = req.body;
    
    console.log('=== ACTUALIZAR CATEGORÍA ===');
    console.log('ID:', id);
    console.log('Body completo:', req.body);
    
    // Validaciones básicas
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de categoría es requerido'
      });
    }
    
    if (!nombre || !hora_salida) {
      return res.status(400).json({
        success: false,
        message: 'El nombre y la hora de salida son obligatorios'
      });
    }
    
    // Limpiar los datos y convertir nombre a mayúsculas
    const nombreTrimmed = nombre.trim().toUpperCase();
    const horaSalidaTrimmed = hora_salida.trim();
    
    if (!nombreTrimmed || !horaSalidaTrimmed) {
      return res.status(400).json({
        success: false,
        message: 'El nombre y la hora de salida no pueden estar vacíos'
      });
    }
    
    // Verificar si la categoría existe
    const { data: existingCategoria, error: checkError } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (checkError) {
      console.error('Error al verificar categoría:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
    
    if (!existingCategoria) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }
    
    // Verificar si ya existe otra categoría con el mismo nombre
    const { data: duplicateCategoria, error: duplicateError } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .eq('nombre', nombreTrimmed)
      .neq('id', id)
      .maybeSingle();

    if (duplicateError) {
      console.error('Error al verificar duplicado:', duplicateError);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
    
    if (duplicateCategoria) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe otra categoría con ese nombre'
      });
    }
    
    // MÉTODO ALTERNATIVO: Usar SQL directo para la actualización
    console.log('🔄 Intentando actualización con SQL directo...');
    
    const { data, error } = await supabaseAdmin.rpc('update_categoria_direct', {
      categoria_id: id,
      nuevo_nombre: nombreTrimmed,
      nueva_hora_salida: horaSalidaTrimmed
    });

    if (error) {
      console.log('❌ Función SQL falló, intentando método estándar...');
      
      // Fallback al método estándar
      const { data: updateData, error: updateError } = await supabaseAdmin
        .from('categorias')
        .update({ 
          nombre: nombreTrimmed, 
          hora_salida: horaSalidaTrimmed,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('Error al actualizar categoría:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Error al actualizar la categoría',
          error: updateError.message
        });
      }

      if (!updateData) {
        return res.status(500).json({
          success: false,
          message: 'No se pudo actualizar la categoría'
        });
      }

      console.log('✅ Categoría actualizada (método estándar):', updateData);
      
      return res.json({
        success: true,
        message: 'Categoría actualizada exitosamente',
        data: updateData
      });
    }
    
    // Si la función SQL funcionó
    console.log('✅ Categoría actualizada (SQL directo):', data);
    
    // Obtener la categoría actualizada
    const { data: updatedCategoria } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    
    res.json({
      success: true,
      message: 'Categoría actualizada exitosamente',
      data: updatedCategoria || data
    });
    
  } catch (error) {
    console.error('❌ Error inesperado en updateCategoria:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Eliminar una categoría
const deleteCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== ELIMINAR CATEGORÍA ===');
    console.log('ID:', id);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de categoría es requerido'
      });
    }
    
    // Verificar si la categoría existe
    const { data: existingCategoria, error: checkError } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (checkError) {
      console.error('Error al verificar categoría:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
    
    if (!existingCategoria) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }
    
    // Eliminar categoría
    const { error } = await supabaseAdmin
      .from('categorias')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error al eliminar categoría:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al eliminar la categoría',
        error: error.message
      });
    }
    
    console.log('Categoría eliminada exitosamente:', existingCategoria);
    
    res.json({
      success: true,
      message: 'Categoría eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error inesperado en deleteCategoria:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

module.exports = {
  getCategorias,
  createCategoria,
  getCategoriaById,
  updateCategoria,
  deleteCategoria
};