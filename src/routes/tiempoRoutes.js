const express = require('express');
const router = express.Router();
const tiempoController = require('../controllers/tiempoController');
const { authenticateToken } = require('../controllers/authController');
// Importar Supabase en lugar de pool
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Función auxiliar para formatear tiempo
const formatTime = (timeMs) => {
  if (!timeMs || timeMs < 0) return '00:00.00';
  
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const centiseconds = Math.floor((timeMs % 1000) / 10);
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
};

// RUTAS PÚBLICAS - SIN AUTENTICACIÓN

// Obtener todas las categorías
router.get('/categorias', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .order('hora_salida', { ascending: true });

    if (error) {
      console.error('Error obteniendo categorías:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }

    res.json({ 
      success: true,
      categorias: data || [] 
    });
  } catch (err) {
    console.error('Error obteniendo categorías:', err);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener todas las etapas activas
router.get('/etapas', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('etapas')
      .select('*')
      .eq('activa', true)
      .order('numero_etapa', { ascending: true });

    if (error) {
      console.error('Error obteniendo etapas:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }

    res.json({ 
      success: true,
      etapas: data || [] 
    });
  } catch (err) {
    console.error('Error obteniendo etapas:', err);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener tiempos por etapa
router.get('/etapas/:etapaId/tiempos', async (req, res) => {
  try {
    const { etapaId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('tiempos')
      .select(`
        *,
        participantes!inner (
          id,
          nombre,
          apellidos,
          dorsal,
          ci,
          categoria_id,
          categorias (
            id,
            nombre,
            hora_salida
          )
        ),
        etapas (
          id,
          nombre,
          numero_etapa
        )
      `)
      .eq('etapa_id', etapaId)
      .order('posicion', { ascending: true, nullsLast: true })
      .order('tiempo_final', { ascending: true });

    if (error) {
      console.error('Error en getTiemposByEtapa:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }

    res.json({ 
      success: true,
      tiempos: data || [] 
    });
  } catch (err) {
    console.error('Error obteniendo tiempos:', err);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener estadísticas de una etapa
router.get('/etapas/:etapaId/estadisticas', async (req, res) => {
  try {
    const { etapaId } = req.params;

    // Obtener todos los tiempos de la etapa
    const { data: tiempos, error } = await supabaseAdmin
      .from('tiempos')
      .select('tiempo_final')
      .eq('etapa_id', etapaId);

    if (error) {
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }

    if (!tiempos || tiempos.length === 0) {
      return res.json({
        success: true,
        total_participantes: 0,
        tiempo_promedio: 0,
        tiempo_mejor: 0,
        tiempo_peor: 0
      });
    }

    const tiemposArray = tiempos.map(t => t.tiempo_final);
    const total = tiemposArray.length;
    const suma = tiemposArray.reduce((a, b) => a + b, 0);
    const promedio = Math.round(suma / total);
    const mejor = Math.min(...tiemposArray);
    const peor = Math.max(...tiemposArray);

    res.json({
      success: true,
      total_participantes: total,
      tiempo_promedio: promedio,
      tiempo_mejor: mejor,
      tiempo_peor: peor
    });
  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener clasificación general por categoría
router.get('/clasificacion/:categoriaId', async (req, res) => {
  try {
    const { categoriaId } = req.params;

    // Obtener todos los tiempos de participantes de la categoría específica
    const { data, error } = await supabaseAdmin
      .from('tiempos')
      .select(`
        participante_id,
        tiempo_final,
        participantes!inner (
          id,
          nombre,
          apellidos,
          dorsal,
          ci,
          categoria_id
        )
      `)
      .eq('participantes.categoria_id', categoriaId);

    if (error) {
      console.error('Error en getClasificacionGeneral:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }

    // Agrupar por participante y sumar tiempos
    const participantesMap = {};
    
    (data || []).forEach(tiempo => {
      const participanteId = tiempo.participante_id;
      
      if (!participantesMap[participanteId]) {
        participantesMap[participanteId] = {
          participante_id: participanteId,
          participantes: tiempo.participantes,
          tiempo_total: 0,
          etapas_completadas: 0
        };
      }
      
      participantesMap[participanteId].tiempo_total += tiempo.tiempo_final;
      participantesMap[participanteId].etapas_completadas += 1;
    });

    // Convertir a array y ordenar por tiempo total
    const clasificacion = Object.values(participantesMap)
      .sort((a, b) => a.tiempo_total - b.tiempo_total)
      .map((item, index) => ({
        ...item,
        posicion: index + 1
      }));

    res.json({ 
      success: true,
      clasificacion 
    });
  } catch (err) {
    console.error('Error obteniendo clasificación:', err);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener resumen de resultados
router.get('/resumen-resultados', async (req, res) => {
  try {
    // Obtener número de categorías
    const { data: categorias, error: errorCategorias } = await supabaseAdmin
      .from('categorias')
      .select('id', { count: 'exact' });

    // Obtener número de etapas activas
    const { data: etapas, error: errorEtapas } = await supabaseAdmin
      .from('etapas')
      .select('id', { count: 'exact' })
      .eq('activa', true);

    // Obtener número total de tiempos registrados
    const { data: tiempos, error: errorTiempos } = await supabaseAdmin
      .from('tiempos')
      .select('id', { count: 'exact' });

    // Obtener número total de participantes únicos con tiempos
    const { data: participantesConTiempos, error: errorParticipantes } = await supabaseAdmin
      .from('tiempos')
      .select('participante_id', { count: 'exact', head: false });

    if (errorCategorias || errorEtapas || errorTiempos || errorParticipantes) {
      return res.status(500).json({
        success: false,
        error: 'Error obteniendo resumen'
      });
    }

    const totalCategorias = categorias?.length || 0;
    const totalEtapas = etapas?.length || 0;
    const totalTiempos = tiempos?.length || 0;
    
    // Contar participantes únicos
    const participantesUnicos = new Set(
      (participantesConTiempos || []).map(t => t.participante_id)
    ).size;

    res.json({
      success: true,
      total_categorias: totalCategorias,
      total_etapas: totalEtapas,
      total_tiempos: totalTiempos,
      participantes_con_tiempos: participantesUnicos,
      hay_resultados: totalTiempos > 0
    });
  } catch (err) {
    console.error('Error obteniendo resumen:', err);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Endpoint para verificar si hay resultados disponibles
router.get('/check-resultados', async (req, res) => {
  try {
    const { data: tiempos, error } = await supabaseAdmin
      .from('tiempos')
      .select('id')
      .limit(1);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      hay_resultados: (tiempos || []).length > 0
    });
  } catch (err) {
    console.error('Error verificando resultados:', err);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Rutas para etapas
router.get('/etapas', authenticateToken, tiempoController.getEtapas);

// Rutas para participantes
router.get('/participantes', authenticateToken, tiempoController.getParticipantes);

// Rutas para categorías
router.get('/categorias', authenticateToken, tiempoController.getCategorias);
router.get('/hora-salida-base', authenticateToken, tiempoController.getHoraSalidaBase);

// Endpoint de debug temporal
router.get('/debug', authenticateToken, tiempoController.debugTiempos);

// Rutas para tiempos
router.get('/etapas/:etapaId/tiempos', authenticateToken, tiempoController.getTiemposByEtapa);
router.post('/tiempos', authenticateToken, tiempoController.registrarTiempo);
router.put('/tiempos/:id', authenticateToken, tiempoController.updateTiempo);
router.delete('/tiempos/:id', authenticateToken, tiempoController.deleteTiempo);

// Rutas para clasificaciones y estadísticas
router.get('/clasificacion/:categoriaId', authenticateToken, tiempoController.getClasificacionGeneral);
router.get('/etapas/:etapaId/estadisticas', authenticateToken, tiempoController.getEstadisticasEtapa);

// Ruta de diagnóstico
router.get('/diagnostico', authenticateToken, tiempoController.diagnosticoCompleto);

// También actualizar el endpoint debug existente si quieres mantenerlo:
router.get('/debug', authenticateToken, tiempoController.debugTiempos);

// Ruta para registro rápido con bonificaciones
router.post('/tiempos/rapido', authenticateToken, tiempoController.registrarTiempoConBonificacion);

// Ruta para aplicar bonificaciones a una etapa completa
router.post('/etapas/:etapaId/bonificaciones', authenticateToken, tiempoController.aplicarBonificacionesEtapa);

// Ruta para obtener información de bonificaciones
router.get('/bonificaciones/info', authenticateToken, tiempoController.obtenerInfoBonificaciones);

// Ruta para obtener participante por dorsal (para búsqueda rápida)
router.get('/participantes/dorsal/:dorsal', authenticateToken, async (req, res) => {
  try {
    const { dorsal } = req.params;
    
    const { data, error } = await supabaseAdmin
      .from('participantes')
      .select(`
        *,
        categorias (
          id,
          nombre,
          hora_salida
        )
      `)
      .eq('dorsal', dorsal)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Participante no encontrado' 
        });
      }
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    res.json({
      success: true,
      participante: data
    });

  } catch (error) {
    console.error('Error buscando participante por dorsal:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

router.get('/lista', authenticateToken, async (req, res) => {
  try {
    const { etapa_id, categoria_id, fecha_desde, fecha_hasta, page = 1, limit = 100 } = req.query;
    
    // Construir la consulta usando Supabase
    let query = supabaseAdmin
      .from('tiempos')
      .select(`
        id,
        participante_id,
        etapa_id,
        tiempo,
        tiempo_final,
        posicion,
        penalizacion,
        observaciones,
        created_at,
        updated_at,
        participantes (
          id,
          nombre,
          apellidos,
          ci,
          dorsal,
          categoria_id,
          categorias (
            id,
            nombre,
            hora_salida
          )
        ),
        etapas (
          id,
          numero_etapa,
          nombre,
          descripcion
        )
      `);

    // Aplicar filtros
    if (etapa_id) {
      query = query.eq('etapa_id', etapa_id);
    }

    if (categoria_id) {
      query = query.eq('participantes.categoria_id', categoria_id);
    }

    if (fecha_desde) {
      query = query.gte('created_at', fecha_desde);
    }

    if (fecha_hasta) {
      query = query.lte('created_at', fecha_hasta);
    }

    // Ordenamiento y paginación
    query = query
      .order('numero_etapa', { foreignTable: 'etapas', ascending: true })
      .order('posicion', { ascending: true })
      .order('tiempo_final', { ascending: true });

    // Paginación
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error obteniendo lista de tiempos:', error);
      return res.status(500).json({
        success: false,
        error: 'Error obteniendo tiempos: ' + error.message
      });
    }

    // Formatear los datos para mantener compatibilidad con el frontend
    const tiempos = (data || []).map(row => ({
      id: row.id,
      participante_id: row.participante_id,
      etapa_id: row.etapa_id,
      tiempo: row.tiempo,
      tiempo_final: row.tiempo_final,
      posicion: row.posicion,
      penalizacion: row.penalizacion || 0,
      observaciones: row.observaciones,
      created_at: row.created_at,
      updated_at: row.updated_at,
      participantes: {
        id: row.participantes?.id,
        nombre: row.participantes?.nombre,
        apellidos: row.participantes?.apellidos,
        ci: row.participantes?.ci,
        dorsal: row.participantes?.dorsal,
        categoria_id: row.participantes?.categoria_id,
        categorias: {
          id: row.participantes?.categorias?.id,
          nombre: row.participantes?.categorias?.nombre,
          hora_salida: row.participantes?.categorias?.hora_salida
        }
      },
      etapas: {
        id: row.etapas?.id,
        numero_etapa: row.etapas?.numero_etapa,
        nombre: row.etapas?.nombre,
        descripcion: row.etapas?.descripcion
      }
    }));

    // Obtener total para paginación (si no se obtiene del count automático)
    let total = count;
    if (total === null) {
      // Fallback: contar manualmente si es necesario
      let countQuery = supabaseAdmin
        .from('tiempos')
        .select('id', { count: 'exact' });
      
      if (etapa_id) countQuery = countQuery.eq('etapa_id', etapa_id);
      if (categoria_id) countQuery = countQuery.eq('participantes.categoria_id', categoria_id);
      if (fecha_desde) countQuery = countQuery.gte('created_at', fecha_desde);
      if (fecha_hasta) countQuery = countQuery.lte('created_at', fecha_hasta);
      
      const { count: totalCount } = await countQuery;
      total = totalCount || 0;
    }

    res.json({
      success: true,
      tiempos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo lista de tiempos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// PUT /api/tiempos/tiempos/:id - Actualizar tiempo específico
router.put('/tiempos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { participante_id, etapa_id, tiempo, penalizacion = 0, observaciones } = req.body;

    // Validaciones básicas
    if (!participante_id || !etapa_id || !tiempo) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: participante_id, etapa_id, tiempo'
      });
    }

    if (tiempo <= 0) {
      return res.status(400).json({
        success: false,
        error: 'El tiempo debe ser mayor a 0'
      });
    }

    if (penalizacion < 0) {
      return res.status(400).json({
        success: false,
        error: 'La penalización no puede ser negativa'
      });
    }

    // Verificar que existe el tiempo
    const { data: existingTime, error: checkError } = await supabaseAdmin
      .from('tiempos')
      .select('id')
      .eq('id', id)
      .single();
    
    if (checkError || !existingTime) {
      return res.status(404).json({
        success: false,
        error: 'Tiempo no encontrado'
      });
    }

    // Verificar que existe el participante
    const { data: participante, error: participanteError } = await supabaseAdmin
      .from('participantes')
      .select('id')
      .eq('id', participante_id)
      .single();
    
    if (participanteError || !participante) {
      return res.status(400).json({
        success: false,
        error: 'Participante no encontrado'
      });
    }

    // Verificar que existe la etapa
    const { data: etapa, error: etapaError } = await supabaseAdmin
      .from('etapas')
      .select('id')
      .eq('id', etapa_id)
      .single();
    
    if (etapaError || !etapa) {
      return res.status(400).json({
        success: false,
        error: 'Etapa no encontrada'
      });
    }

    // Calcular tiempo final
    const tiempo_final = parseInt(tiempo) + parseInt(penalizacion);

    // Actualizar el tiempo
    const updateData = {
      participante_id,
      etapa_id,
      tiempo: parseInt(tiempo),
      penalizacion: parseInt(penalizacion),
      tiempo_final,
      updated_at: new Date().toISOString()
    };

    if (observaciones !== undefined) {
      updateData.observaciones = observaciones;
    }

    const { data: updatedTime, error: updateError } = await supabaseAdmin
      .from('tiempos')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        participantes (
          id,
          nombre,
          apellidos,
          ci,
          dorsal,
          categoria_id,
          categorias (
            id,
            nombre,
            hora_salida
          )
        ),
        etapas (
          id,
          numero_etapa,
          nombre
        )
      `)
      .single();
    
    if (updateError) {
      console.error('Error actualizando tiempo:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Error actualizando tiempo: ' + updateError.message
      });
    }

    // Recalcular posiciones para esa etapa
    await recalcularPosiciones(etapa_id);

    res.json({
      success: true,
      mensaje: 'Tiempo actualizado correctamente',
      tiempo: updatedTime
    });

  } catch (error) {
    console.error('Error actualizando tiempo:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// DELETE /api/tiempos/tiempos/:id - Eliminar tiempo específico
router.delete('/tiempos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que existe el tiempo y obtener la etapa
    const { data: existingTime, error: checkError } = await supabaseAdmin
      .from('tiempos')
      .select('etapa_id')
      .eq('id', id)
      .single();
    
    if (checkError || !existingTime) {
      return res.status(404).json({
        success: false,
        error: 'Tiempo no encontrado'
      });
    }

    const etapa_id = existingTime.etapa_id;

    // Eliminar el tiempo
    const { error: deleteError } = await supabaseAdmin
      .from('tiempos')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error eliminando tiempo:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Error eliminando tiempo: ' + deleteError.message
      });
    }

    // Recalcular posiciones para esa etapa
    await recalcularPosiciones(etapa_id);

    res.json({
      success: true,
      mensaje: 'Tiempo eliminado correctamente'
    });

  } catch (error) {
    console.error('Error eliminando tiempo:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Función auxiliar para recalcular posiciones
async function recalcularPosiciones(etapa_id) {
  try {
    // Obtener todos los tiempos de la etapa ordenados por tiempo final
    const { data: tiempos, error } = await supabaseAdmin
      .from('tiempos')
      .select('id, tiempo_final')
      .eq('etapa_id', etapa_id)
      .order('tiempo_final', { ascending: true });

    if (error || !tiempos) {
      console.error('Error obteniendo tiempos para recalcular posiciones:', error);
      return;
    }

    // Actualizar posiciones una por una
    for (let i = 0; i < tiempos.length; i++) {
      const nuevaPosicion = i + 1;
      await supabaseAdmin
        .from('tiempos')
        .update({ posicion: nuevaPosicion })
        .eq('id', tiempos[i].id);
    }

    console.log(`Posiciones recalculadas para etapa ${etapa_id}: ${tiempos.length} tiempos`);
  } catch (error) {
    console.error('Error recalculando posiciones:', error);
    throw error;
  }
}

// Función auxiliar para obtener tiempo completo - ELIMINADA ya que no se usa
// (el controlador ya tiene métodos similares)

module.exports = router;