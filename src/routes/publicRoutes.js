const express = require('express');
const router = express.Router();
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

module.exports = router;