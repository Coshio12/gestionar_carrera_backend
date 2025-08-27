const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
// Usar la service_role key para bypasear RLS
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// Cliente normal para operaciones que requieren RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// Cliente admin para operaciones de inserción/actualización
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Función auxiliar para convertir hora HH:MM:SS a minutos desde medianoche
const timeToMinutes = (timeString) => {
  const [hours, minutes, seconds = 0] = timeString.split(':').map(Number);
  return hours * 60 + minutes + (seconds / 60);
};

// Función auxiliar para calcular diferencia de salida en milisegundos
const calcularDiferenciaSalida = (horaSalidaCategoria, horaSalidaBase) => {
  const minutosCategoria = timeToMinutes(horaSalidaCategoria);
  const minutosBase = timeToMinutes(horaSalidaBase);
  return (minutosCategoria - minutosBase) * 60 * 1000; // Convertir a milisegundos
};

// Bonificaciones según reglamento
const BONIFICACIONES = {
  1: 10000, // 10 segundos en milisegundos
  2: 6000,  // 6 segundos
  3: 4000,  // 4 segundos
  4: 2000,  // 2 segundos
  5: 1000   // 1 segundo
};

// Función para aplicar bonificación
const aplicarBonificacion = (tiempo, posicion) => {
  if (!posicion || posicion > 5) {
    return tiempo;
  }
  
  const bonificacion = BONIFICACIONES[posicion] || 0;
  return Math.max(0, tiempo - bonificacion); // No permitir tiempos negativos
};

// Función para calcular posiciones automáticas y aplicar bonificaciones
const recalcularPosicionesConBonificaciones = async (etapaId) => {
  try {
    console.log('Recalculando posiciones con bonificaciones para etapa:', etapaId);
    
    // Obtener todos los tiempos de la etapa ordenados por tiempo_final
    const { data: tiempos, error } = await supabaseAdmin
      .from('tiempos')
      .select('id, tiempo, tiempo_final, penalizacion, posicion')
      .eq('etapa_id', etapaId)
      .order('tiempo_final', { ascending: true });

    if (error || !tiempos) {
      console.error('Error obteniendo tiempos para recalcular:', error);
      return;
    }

    if (tiempos.length === 0) {
      console.log('No hay tiempos para recalcular en etapa:', etapaId);
      return;
    }

    console.log(`Recalculando ${tiempos.length} posiciones para etapa ${etapaId}`);

    // Primera pasada: asignar posiciones basadas en tiempo_final actual
    for (let i = 0; i < tiempos.length; i++) {
      const nuevaPosicion = i + 1;
      
      await supabaseAdmin
        .from('tiempos')
        .update({ posicion: nuevaPosicion })
        .eq('id', tiempos[i].id);
    }

    // Segunda pasada: aplicar bonificaciones a los primeros 5 puestos
    for (let i = 0; i < Math.min(5, tiempos.length); i++) {
      const tiempo = tiempos[i];
      const posicion = i + 1;
      
      // Aplicar bonificación al tiempo original
      const tiempoConBonificacion = aplicarBonificacion(tiempo.tiempo, posicion);
      const tiempoFinalConBonificacion = tiempoConBonificacion + (tiempo.penalizacion || 0);
      
      // Actualizar con bonificación
      await supabaseAdmin
        .from('tiempos')
        .update({ 
          tiempo: tiempoConBonificacion,
          // No actualizar tiempo_final directamente si es columna generada
          observaciones: `Bonificación aplicada: ${BONIFICACIONES[posicion]/1000}s (Posición ${posicion})`
        })
        .eq('id', tiempo.id);
    }

    console.log(`Bonificaciones aplicadas exitosamente para etapa ${etapaId}`);
  } catch (error) {
    console.error('Error en recalcularPosicionesConBonificaciones:', error);
    throw error;
  }
};

// Obtener todas las etapas activas
exports.getEtapas = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('etapas')
      .select('*')
      .eq('activa', true)
      .order('numero_etapa', { ascending: true });

    if (error) {
      console.error('Error obteniendo etapas:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ etapas: data || [] });
  } catch (err) {
    console.error('Error obteniendo etapas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener todos los participantes con sus categorías
exports.getParticipantes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('participantes')
      .select(`
        *,
        categorias (
          id,
          nombre,
          hora_salida
        )
      `)
      .order('dorsal', { ascending: true });

    if (error) {
      console.error('Error obteniendo participantes:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ participantes: data || [] });
  } catch (err) {
    console.error('Error obteniendo participantes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener tiempos por etapa
exports.getTiemposByEtapa = async (req, res) => {
  try {
    const { etapaId } = req.params;

    const { data, error } = await supabase
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
      .order('tiempo_final', { ascending: true });

    if (error) {
      console.error('Error en getTiemposByEtapa:', error);
      return res.status(500).json({ error: error.message });
    }

    // Agregar posición basada en el orden
    const tiemposConPosicion = (data || []).map((tiempo, index) => ({
      ...tiempo,
      posicion: index + 1
    }));

    res.json({ tiempos: tiemposConPosicion });
  } catch (err) {
    console.error('Error obteniendo tiempos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Registrar nuevo tiempo
// Registrar nuevo tiempo
// Registrar nuevo tiempo - Versión robusta
exports.registrarTiempo = async (req, res) => {
  try {
    console.log('=== REGISTRO DE TIEMPO ===');
    console.log('Body completo:', req.body);
    
    const {
      participante_id,
      etapa_id,
      tiempo,
      posicion,
      penalizacion = 0,
      observaciones
    } = req.body;

    console.log('Datos extraídos:', {
      participante_id,
      etapa_id,
      tiempo,
      posicion,
      penalizacion,
      observaciones
    });

    // Validar campos requeridos
    if (!participante_id || !etapa_id || tiempo === undefined || tiempo === null) {
      const errorMsg = `Faltan campos requeridos: participante_id(${participante_id}), etapa_id(${etapa_id}), tiempo(${tiempo})`;
      console.log(errorMsg);
      return res.status(400).json({ error: errorMsg });
    }

    // Validar que los valores sean números válidos
    const etapaIdNum = parseInt(etapa_id);
    const tiempoNum = parseInt(tiempo);
    const penalizacionNum = parseInt(penalizacion) || 0;

    console.log('Valores convertidos:', {
      participante_id,
      etapaIdNum,
      tiempoNum,
      penalizacionNum
    });

    if (isNaN(etapaIdNum) || isNaN(tiempoNum) || tiempoNum <= 0) {
      const errorMsg = `Valores numéricos inválidos: etapa_id(${etapa_id}), tiempo(${tiempo})`;
      console.log(errorMsg);
      return res.status(400).json({ error: errorMsg });
    }

    // Verificar si ya existe un tiempo para este participante en esta etapa
    console.log('Verificando tiempo existente...');
    const { data: existingTime, error: checkError } = await supabaseAdmin
      .from('tiempos')
      .select('id')
      .eq('participante_id', participante_id)
      .eq('etapa_id', etapaIdNum)
      .maybeSingle();

    if (checkError) {
      console.log('Error verificando tiempo existente:', checkError);
      return res.status(500).json({ error: 'Error verificando tiempo existente: ' + checkError.message });
    }

    if (existingTime) {
      console.log('Ya existe tiempo:', existingTime);
      return res.status(400).json({ 
        error: 'Ya existe un tiempo registrado para este participante en esta etapa' 
      });
    }

    // Obtener información del participante y su categoría
    console.log('Obteniendo información del participante...');
    let participante = null;
    let categoria = null;
    
    try {
      const { data: participanteData, error: participanteError } = await supabaseAdmin
        .from('participantes')
        .select(`
          id,
          nombre,
          apellidos,
          dorsal,
          categoria_id,
          categorias (
            id,
            nombre,
            hora_salida
          )
        `)
        .eq('id', participante_id)
        .single();

      if (participanteError) {
        console.log('Error obteniendo participante:', participanteError);
        return res.status(400).json({ error: 'Participante no encontrado: ' + participanteError.message });
      }

      participante = participanteData;
      categoria = participanteData.categorias;
      
      console.log('Participante encontrado:', {
        id: participante.id,
        nombre: participante.nombre,
        categoria: categoria?.nombre,
        hora_salida: categoria?.hora_salida
      });
    } catch (participanteErr) {
      console.error('Error crítico obteniendo participante:', participanteErr);
      return res.status(500).json({ error: 'Error obteniendo información del participante' });
    }

    // Calcular tiempo final (inicialmente igual al tiempo original)
    let tiempoFinal = tiempoNum;
    
    // Solo calcular ajuste si tenemos información de categoría
    if (categoria?.hora_salida) {
      try {
        // Obtener la hora de salida base (la más temprana)
        const { data: categoriaBase, error: baseError } = await supabaseAdmin
          .from('categorias')
          .select('hora_salida')
          .order('hora_salida', { ascending: true })
          .limit(1)
          .single();

        if (!baseError && categoriaBase?.hora_salida) {
          const diferenciaSalida = calcularDiferenciaSalida(
            categoria.hora_salida,
            categoriaBase.hora_salida
          );
          
          // El tiempo final es el tiempo cronometrado MÁS la diferencia de salida
          tiempoFinal = tiempoNum + diferenciaSalida;
          
          console.log('Cálculo de tiempo final:', {
            tiempoOriginal: tiempoNum,
            horaCategoriaParticipante: categoria.hora_salida,
            horaBase: categoriaBase.hora_salida,
            diferenciaSalida: diferenciaSalida,
            tiempoFinal: tiempoFinal
          });
        } else {
          console.log('No se pudo obtener hora base, usando tiempo original');
        }
      } catch (tiempoErr) {
        console.error('Error calculando tiempo ajustado:', tiempoErr);
        console.log('Usando tiempo original sin ajuste');
        // Continuar con tiempo original si hay error en el cálculo
      }
    } else {
      console.log('Sin información de categoría, usando tiempo original');
    }

    // Calcular posición temporal
    let posicionCalculada = posicion;
    if (!posicionCalculada) {
      try {
        const { data: tiemposExistentes, error: countError } = await supabaseAdmin
          .from('tiempos')
          .select('id')
          .eq('etapa_id', etapaIdNum);
        
        if (!countError) {
          posicionCalculada = (tiemposExistentes?.length || 0) + 1;
        } else {
          posicionCalculada = 1;
        }
      } catch (posErr) {
        console.error('Error calculando posición:', posErr);
        posicionCalculada = 1;
      }
    }

    // Preparar datos para inserción con manejo de columnas opcionales
    const nuevoTiempo = {
      participante_id: participante_id,
      etapa_id: etapaIdNum,
      tiempo: tiempoNum,
      penalizacion: penalizacionNum,
      posicion: posicionCalculada
    };

    // Solo agregar tiempo_final si es diferente del tiempo original
    if (tiempoFinal !== tiempoNum) {
      nuevoTiempo.tiempo_final = tiempoFinal;
    }

    // Agregar campos opcionales si existen
    if (observaciones) {
      nuevoTiempo.observaciones = observaciones;
    }

    console.log('Insertando tiempo:', nuevoTiempo);

    // Intentar inserción con manejo de errores específicos
    let data = null;
    try {
      const result = await supabaseAdmin
        .from('tiempos')
        .insert(nuevoTiempo)
        .select(`
          *,
          participantes (
            id,
            nombre,
            apellidos,
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
            nombre,
            numero_etapa
          )
        `)
        .single();

      if (result.error) {
        console.error('Error en inserción Supabase:', result.error);
        
        // Verificar si es un error de columna inexistente
        if (result.error.message?.includes('tiempo_final')) {
          console.log('Columna tiempo_final no existe, insertando sin ella...');
          
          // Reintentar sin tiempo_final
          const tiempoSinFinal = { ...nuevoTiempo };
          delete tiempoSinFinal.tiempo_final;
          
          const retryResult = await supabaseAdmin
            .from('tiempos')
            .insert(tiempoSinFinal)
            .select(`
              *,
              participantes (
                id,
                nombre,
                apellidos,
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
                nombre,
                numero_etapa
              )
            `)
            .single();
            
          if (retryResult.error) {
            throw retryResult.error;
          }
          
          data = retryResult.data;
        } else {
          throw result.error;
        }
      } else {
        data = result.data;
      }
    } catch (insertError) {
      console.error('Error crítico en inserción:', insertError);
      return res.status(500).json({ 
        error: 'Error registrando tiempo en la base de datos',
        details: insertError.message,
        code: insertError.code
      });
    }

    if (!data) {
      console.error('No se retornaron datos después de la inserción');
      return res.status(500).json({ error: 'No se pudieron recuperar los datos del tiempo insertado' });
    }

    console.log('Tiempo insertado exitosamente:', data);

    // Recalcular posiciones (opcional, con manejo de errores)
    try {
      await recalcularPosiciones(etapaIdNum);
    } catch (recalcError) {
      console.error('Error recalculando posiciones (no crítico):', recalcError);
      // No fallar la operación por esto
    }

    res.status(201).json({ 
      message: 'Tiempo registrado con éxito',
      tiempo: data
    });

  } catch (err) {
    console.error('=== ERROR COMPLETO EN SERVIDOR ===');
    console.error('Error:', err);
    console.error('Error stack:', err.stack);
    console.error('Error message:', err.message);
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Función auxiliar para recalcular posiciones
const recalcularPosiciones = async (etapaId) => {
  try {
    console.log('Recalculando posiciones para etapa:', etapaId);
    
    // Obtener todos los tiempos de la etapa ordenados por tiempo_final o tiempo
    const { data: tiempos, error } = await supabaseAdmin
      .from('tiempos')
      .select('id, tiempo, tiempo_final, penalizacion')
      .eq('etapa_id', etapaId)
      .order('tiempo_final', { ascending: true });

    if (error) {
      console.error('Error obteniendo tiempos para recalcular:', error);
      return;
    }

    if (!tiempos || tiempos.length === 0) {
      console.log('No hay tiempos para recalcular en etapa:', etapaId);
      return;
    }

    console.log(`Recalculando ${tiempos.length} posiciones para etapa ${etapaId}`);

    // Actualizar posiciones una por una para evitar conflictos
    for (let i = 0; i < tiempos.length; i++) {
      const nuevaPosicion = i + 1;
      
      const { error: updateError } = await supabaseAdmin
        .from('tiempos')
        .update({ posicion: nuevaPosicion })
        .eq('id', tiempos[i].id);

      if (updateError) {
        console.error(`Error actualizando posición para tiempo ${tiempos[i].id}:`, updateError);
        // Continuar con los demás
      }
    }

    console.log(`Posiciones recalculadas exitosamente para etapa ${etapaId}`);
  } catch (error) {
    console.error('Error en recalcularPosiciones:', error);
    throw error;
  }
};

// Actualizar tiempo existente
// Actualizar tiempo existente
// Actualizar tiempo existente
// Actualizar tiempo existente
exports.updateTiempo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      participante_id,
      etapa_id,
      tiempo,
      penalizacion = 0,
      observaciones
    } = req.body;

    console.log('=== ACTUALIZANDO TIEMPO ===');
    console.log('ID del tiempo:', id);
    console.log('Datos recibidos:', req.body);

    // Validaciones básicas
    if (!tiempo) {
      return res.status(400).json({ 
        success: false,
        error: 'El tiempo es requerido' 
      });
    }

    const tiempoNum = parseInt(tiempo);
    const penalizacionNum = parseInt(penalizacion) || 0;

    if (isNaN(tiempoNum) || tiempoNum <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'El tiempo debe ser un número válido mayor a 0' 
      });
    }

    if (penalizacionNum < 0) {
      return res.status(400).json({ 
        success: false,
        error: 'La penalización no puede ser negativa' 
      });
    }

    // Primero verificar que el tiempo existe
    console.log('Verificando que el tiempo existe...');
    const { data: existingTime, error: checkError } = await supabaseAdmin
      .from('tiempos')
      .select('id, etapa_id, participante_id')
      .eq('id', id)
      .single();

    if (checkError) {
      console.error('Error verificando tiempo existente:', checkError);
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false,
          error: 'Tiempo no encontrado' 
        });
      }
      return res.status(500).json({ 
        success: false,
        error: 'Error verificando tiempo existente: ' + checkError.message 
      });
    }

    if (!existingTime) {
      return res.status(404).json({ 
        success: false,
        error: 'Tiempo no encontrado' 
      });
    }

    console.log('Tiempo existente encontrado:', existingTime);

    // Si se proporciona participante_id y etapa_id, validarlos
    let finalParticipanteId = existingTime.participante_id;
    let finalEtapaId = existingTime.etapa_id;

    if (participante_id) {
      // Verificar que el participante existe
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
      finalParticipanteId = participante_id;
    }

    if (etapa_id) {
      // Verificar que la etapa existe
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
      finalEtapaId = etapa_id;
    }

    // Preparar datos de actualización
    // IMPORTANTE: NO incluir tiempo_final ya que es una columna generada
    const updateData = {
      participante_id: finalParticipanteId,
      etapa_id: finalEtapaId,
      tiempo: tiempoNum,
      penalizacion: penalizacionNum,
      updated_at: new Date().toISOString()
    };

    // Agregar observaciones si se proporcionan
    if (observaciones !== undefined) {
      updateData.observaciones = observaciones;
    }

    console.log('Datos de actualización (sin tiempo_final):', updateData);

    // Verificar si ya existe un tiempo para el participante en la nueva etapa (si se está cambiando)
    if (etapa_id && etapa_id !== existingTime.etapa_id) {
      console.log('Verificando conflicto de etapa...');
      const { data: conflictTime, error: conflictError } = await supabaseAdmin
        .from('tiempos')
        .select('id')
        .eq('participante_id', finalParticipanteId)
        .eq('etapa_id', finalEtapaId)
        .neq('id', id)  // Excluir el tiempo actual
        .maybeSingle();

      if (conflictError && conflictError.code !== 'PGRST116') {
        console.error('Error verificando conflicto:', conflictError);
        return res.status(500).json({
          success: false,
          error: 'Error verificando conflictos: ' + conflictError.message
        });
      }

      if (conflictTime) {
        return res.status(400).json({
          success: false,
          error: `Ya existe un tiempo registrado para este participante en la etapa ${finalEtapaId}`
        });
      }
    }

    // Intentar actualización directa primero
    console.log('Ejecutando actualización directa...');
    let { data: updatedTime, error: updateError } = await supabaseAdmin
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
      `);

    console.log('Resultado de actualización directa:', { data: updatedTime, error: updateError });

    // Si la actualización directa falla o no afecta filas, usar enfoque transaccional
    if (updateError || !updatedTime || updatedTime.length === 0) {
      console.log('Actualización directa falló, intentando enfoque transaccional...');
      
      // Si hay error de restricción única, usar enfoque de recreación
      if (updateError?.code === '23505' || (!updatedTime || updatedTime.length === 0)) {
        console.log('Usando enfoque de recreación del tiempo...');
        
        try {
          // Eliminar el tiempo existente
          const { error: deleteError } = await supabaseAdmin
            .from('tiempos')
            .delete()
            .eq('id', id);

          if (deleteError) {
            console.error('Error eliminando tiempo existente:', deleteError);
            return res.status(500).json({
              success: false,
              error: 'Error eliminando tiempo existente: ' + deleteError.message
            });
          }

          console.log('Tiempo existente eliminado, creando nuevo...');

          // Calcular posición para la nueva etapa
          let posicionCalculada = 1;
          try {
            const { data: tiemposExistentes, error: countError } = await supabaseAdmin
              .from('tiempos')
              .select('id')
              .eq('etapa_id', finalEtapaId);
            
            if (!countError && tiemposExistentes) {
              posicionCalculada = tiemposExistentes.length + 1;
            }
            console.log('Posición calculada para nueva etapa:', posicionCalculada);
          } catch (posErr) {
            console.error('Error calculando posición (usando 1 por defecto):', posErr);
            posicionCalculada = 1;
          }

          // Crear nuevo tiempo con los datos actualizados
          const nuevoTiempoData = {
            participante_id: finalParticipanteId,
            etapa_id: finalEtapaId,
            tiempo: tiempoNum,
            penalizacion: penalizacionNum,
            posicion: posicionCalculada
          };

          // Agregar observaciones si existen
          if (observaciones !== undefined) {
            nuevoTiempoData.observaciones = observaciones;
          }

          console.log('Creando nuevo tiempo:', nuevoTiempoData);

          const { data: newTime, error: insertError } = await supabaseAdmin
            .from('tiempos')
            .insert(nuevoTiempoData)
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

          if (insertError) {
            console.error('Error creando nuevo tiempo:', insertError);
            return res.status(500).json({
              success: false,
              error: 'Error creando nuevo tiempo: ' + insertError.message
            });
          }

          updatedTime = [newTime];
          console.log('Nuevo tiempo creado exitosamente:', newTime.id);

        } catch (transactionError) {
          console.error('Error en enfoque transaccional:', transactionError);
          return res.status(500).json({
            success: false,
            error: 'Error en la transacción de actualización: ' + transactionError.message
          });
        }
      } else {
        // Otro tipo de error
        return res.status(500).json({
          success: false,
          error: 'Error actualizando tiempo: ' + (updateError?.message || 'Error desconocido')
        });
      }
    }
    
    if (updateError) {
      console.error('Error final en actualización:', updateError);
      
      // Manejo específico de errores
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'No se pudo actualizar el tiempo. Es posible que haya sido eliminado.'
        });
      }

      // Error de restricción única
      if (updateError.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'Ya existe un tiempo registrado para este participante en esta etapa'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Error actualizando tiempo: ' + updateError.message
      });
    }

    // Usar el primer elemento si es array, o el objeto si es single
    const finalUpdatedTime = Array.isArray(updatedTime) ? updatedTime[0] : updatedTime;

    if (!finalUpdatedTime) {
      console.error('No se recibieron datos válidos después de la operación');
      return res.status(500).json({
        success: false,
        error: 'No se recibieron datos después de la actualización'
      });
    }

    console.log('Tiempo actualizado exitosamente:', finalUpdatedTime.id);
    console.log('Tiempo final calculado automáticamente:', finalUpdatedTime.tiempo_final);

    // Recalcular posiciones para esa etapa
    try {
      await recalcularPosiciones(finalEtapaId);
      console.log('Posiciones recalculadas para etapa:', finalEtapaId);
    } catch (recalcError) {
      console.error('Error recalculando posiciones (no crítico):', recalcError);
      // No fallar la operación por esto
    }

    res.json({
      success: true,
      message: 'Tiempo actualizado con éxito',
      tiempo: finalUpdatedTime
    });

  } catch (err) {
    console.error('=== ERROR COMPLETO EN ACTUALIZACIÓN ===');
    console.error('Error:', err);
    console.error('Error stack:', err.stack);
    
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor',
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};
// Eliminar tiempo
exports.deleteTiempo = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el tiempo existe
    const { data: existingTime, error: checkError } = await supabaseAdmin
      .from('tiempos')
      .select('*')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Tiempo no encontrado' });
      }
      return res.status(500).json({ error: 'Error verificando tiempo' });
    }

    // Eliminar el tiempo usando supabaseAdmin
    const { error } = await supabaseAdmin
      .from('tiempos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando tiempo:', error);
      return res.status(500).json({ error: 'Error eliminando tiempo' });
    }

    // Recalcular posiciones para la etapa
    if (existingTime.etapa_id) {
      await recalcularPosiciones(existingTime.etapa_id);
    }

    res.json({ 
      message: 'Tiempo eliminado con éxito',
      tiempo: existingTime
    });
  } catch (err) {
    console.error('Error eliminando tiempo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener clasificación general por categoría
exports.getClasificacionGeneral = async (req, res) => {
  try {
    const { categoriaId } = req.params;

    // Obtener todos los tiempos de participantes de la categoría específica
    const { data, error } = await supabase
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
      return res.status(500).json({ error: error.message });
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

    res.json({ clasificacion });
  } catch (err) {
    console.error('Error obteniendo clasificación:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener estadísticas de una etapa
exports.getEstadisticasEtapa = async (req, res) => {
  try {
    const { etapaId } = req.params;

    // Obtener todos los tiempos de la etapa
    const { data: tiempos, error } = await supabase
      .from('tiempos')
      .select('tiempo_final')
      .eq('etapa_id', etapaId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!tiempos || tiempos.length === 0) {
      return res.json({
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
      total_participantes: total,
      tiempo_promedio: promedio,
      tiempo_mejor: mejor,
      tiempo_peor: peor
    });
  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener todas las categorías con sus horarios de salida
exports.getCategorias = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('hora_salida', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ categorias: data || [] });
  } catch (err) {
    console.error('Error obteniendo categorías:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener hora de salida base (la más temprana)
exports.getHoraSalidaBase = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('hora_salida')
      .order('hora_salida', { ascending: true })
      .limit(1)
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ hora_salida_base: data?.hora_salida || null });
  } catch (err) {
    console.error('Error obteniendo hora base:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Endpoint de debug temporal
exports.debugTiempos = async (req, res) => {
  try {
    console.log('=== DEBUG TIEMPOS ===');
    
    // Verificar estructura de tablas
    const { data: tiemposTest, error: tiemposError } = await supabase
      .from('tiempos')
      .select('*')
      .limit(1);
    
    console.log('Estructura tiempos:', tiemposTest, tiemposError);
    
    const { data: participantesTest, error: participantesError } = await supabase
      .from('participantes')
      .select('*')
      .limit(1);
    
    console.log('Estructura participantes:', participantesTest, participantesError);
    
    const { data: etapasTest, error: etapasError } = await supabase
      .from('etapas')
      .select('*')
      .limit(1);
    
    console.log('Estructura etapas:', etapasTest, etapasError);

    const { data: categoriasTest, error: categoriasError } = await supabase
      .from('categorias')
      .select('*')
      .order('hora_salida', { ascending: true });
    
    console.log('Categorías con horarios:', categoriasTest, categoriasError);

    res.json({
      message: 'Debug info logged to console',
      tiempos: { data: tiemposTest, error: tiemposError },
      participantes: { data: participantesTest, error: participantesError },
      etapas: { data: etapasTest, error: etapasError },
      categorias: { data: categoriasTest, error: categoriasError }
    });
  } catch (err) {
    console.error('Error en debug:', err);
    res.status(500).json({ error: 'Error en debug: ' + err.message });
  }
};
// Agregar este endpoint al tiempoController.js

// Endpoint de diagnóstico mejorado
exports.diagnosticoCompleto = async (req, res) => {
  try {
    console.log('=== DIAGNÓSTICO COMPLETO ===');
    
    const diagnostico = {
      timestamp: new Date().toISOString(),
      tests: {}
    };

    // 1. Verificar estructura de tabla tiempos
    try {
      const { data: estructuraTiempos, error: errorEstructura } = await supabase
        .rpc('get_table_columns', { table_name: 'tiempos' });
      
      diagnostico.tests.estructura_tiempos = {
        success: !errorEstructura,
        data: estructuraTiempos,
        error: errorEstructura?.message
      };
    } catch (err) {
      // Método alternativo si no existe la función RPC
      try {
        const { data: sampleTiempo, error: sampleError } = await supabase
          .from('tiempos')
          .select('*')
          .limit(1)
          .single();
        
        diagnostico.tests.estructura_tiempos = {
          success: !sampleError,
          columns: sampleTiempo ? Object.keys(sampleTiempo) : [],
          error: sampleError?.message,
          sample_data: sampleTiempo
        };
      } catch (altErr) {
        diagnostico.tests.estructura_tiempos = {
          success: false,
          error: 'No se pudo verificar estructura: ' + altErr.message
        };
      }
    }

    // 2. Verificar participantes
    try {
      const { data: participantesTest, error: participantesError } = await supabase
        .from('participantes')
        .select(`
          id,
          nombre,
          apellidos,
          categoria_id,
          categorias (
            id,
            nombre,
            hora_salida
          )
        `)
        .limit(1);
      
      diagnostico.tests.participantes = {
        success: !participantesError,
        count: participantesTest?.length || 0,
        error: participantesError?.message,
        sample: participantesTest?.[0]
      };
    } catch (err) {
      diagnostico.tests.participantes = {
        success: false,
        error: err.message
      };
    }

    // 3. Verificar categorías
    try {
      const { data: categoriasTest, error: categoriasError } = await supabase
        .from('categorias')
        .select('*')
        .order('hora_salida', { ascending: true });
      
      diagnostico.tests.categorias = {
        success: !categoriasError,
        count: categoriasTest?.length || 0,
        error: categoriasError?.message,
        data: categoriasTest
      };
    } catch (err) {
      diagnostico.tests.categorias = {
        success: false,
        error: err.message
      };
    }

    // 4. Verificar etapas
    try {
      const { data: etapasTest, error: etapasError } = await supabase
        .from('etapas')
        .select('*')
        .eq('activa', true);
      
      diagnostico.tests.etapas = {
        success: !etapasError,
        count: etapasTest?.length || 0,
        error: etapasError?.message,
        data: etapasTest
      };
    } catch (err) {
      diagnostico.tests.etapas = {
        success: false,
        error: err.message
      };
    }

    // 5. Test de inserción (simulado)
    try {
      // Solo verificar que podemos acceder a la tabla, no insertar realmente
      const { data: countTest, error: countError } = await supabase
        .from('tiempos')
        .select('id', { count: 'exact' })
        .limit(0);
      
      diagnostico.tests.acceso_escritura = {
        success: !countError,
        count: countTest?.length || 0,
        error: countError?.message
      };
    } catch (err) {
      diagnostico.tests.acceso_escritura = {
        success: false,
        error: err.message
      };
    }

    // 6. Verificar permisos con supabaseAdmin
    try {
      const { data: adminTest, error: adminError } = await supabaseAdmin
        .from('tiempos')
        .select('*')
        .limit(1);
      
      diagnostico.tests.permisos_admin = {
        success: !adminError,
        error: adminError?.message,
        can_read: !adminError
      };
    } catch (err) {
      diagnostico.tests.permisos_admin = {
        success: false,
        error: err.message
      };
    }

    // Resumen
    const allTests = Object.values(diagnostico.tests);
    const successfulTests = allTests.filter(test => test.success).length;
    const totalTests = allTests.length;
    
    diagnostico.resumen = {
      tests_exitosos: successfulTests,
      total_tests: totalTests,
      porcentaje_exito: Math.round((successfulTests / totalTests) * 100),
      estado_general: successfulTests === totalTests ? 'BUENO' : 'PROBLEMAS_DETECTADOS'
    };

    console.log('Diagnóstico completado:', diagnostico);

    res.json(diagnostico);
  } catch (err) {
    console.error('Error en diagnóstico:', err);
    res.status(500).json({ 
      error: 'Error ejecutando diagnóstico',
      message: err.message 
    });
  }
};

exports.registrarTiempoConBonificacion = async (req, res) => {
  try {
    console.log('=== REGISTRO DE TIEMPO CON BONIFICACIÓN ===');
    console.log('Body completo:', req.body);
    
    const {
      participante_id,
      etapa_id,
      tiempo,
      posicion,
      penalizacion = 0,
      observaciones,
      aplicar_bonificacion = false
    } = req.body;

    // Validaciones básicas
    if (!participante_id || !etapa_id || tiempo === undefined || tiempo === null) {
      const errorMsg = `Faltan campos requeridos: participante_id(${participante_id}), etapa_id(${etapa_id}), tiempo(${tiempo})`;
      console.log(errorMsg);
      return res.status(400).json({ error: errorMsg });
    }

    const etapaIdNum = parseInt(etapa_id);
    let tiempoNum = parseInt(tiempo);
    const penalizacionNum = parseInt(penalizacion) || 0;

    if (isNaN(etapaIdNum) || isNaN(tiempoNum) || tiempoNum <= 0) {
      const errorMsg = `Valores numéricos inválidos: etapa_id(${etapa_id}), tiempo(${tiempo})`;
      return res.status(400).json({ error: errorMsg });
    }

    // Aplicar bonificación si está habilitada y se especificó posición
    let observacionesFinales = observaciones;
    if (aplicar_bonificacion && posicion && posicion <= 5) {
      const tiempoOriginal = tiempoNum;
      tiempoNum = aplicarBonificacion(tiempoNum, parseInt(posicion));
      
      const bonificacionAplicada = BONIFICACIONES[parseInt(posicion)] || 0;
      const observacionBonificacion = `Bonificación aplicada: ${bonificacionAplicada/1000}s (Posición ${posicion})`;
      
      observacionesFinales = observaciones 
        ? `${observaciones}. ${observacionBonificacion}`
        : observacionBonificacion;
        
      console.log(`Bonificación aplicada: ${tiempoOriginal}ms -> ${tiempoNum}ms (${bonificacionAplicada/1000}s menos)`);
    }

    // Verificar si ya existe un tiempo para este participante en esta etapa
    const { data: existingTime, error: checkError } = await supabaseAdmin
      .from('tiempos')
      .select('id')
      .eq('participante_id', participante_id)
      .eq('etapa_id', etapaIdNum)
      .maybeSingle();

    if (checkError) {
      console.log('Error verificando tiempo existente:', checkError);
      return res.status(500).json({ error: 'Error verificando tiempo existente: ' + checkError.message });
    }

    if (existingTime) {
      return res.status(400).json({ 
        error: 'Ya existe un tiempo registrado para este participante en esta etapa' 
      });
    }

    // Calcular posición si no se proporcionó
    let posicionCalculada = posicion ? parseInt(posicion) : null;
    if (!posicionCalculada) {
      const { data: tiemposExistentes } = await supabaseAdmin
        .from('tiempos')
        .select('id')
        .eq('etapa_id', etapaIdNum);
      
      posicionCalculada = (tiemposExistentes?.length || 0) + 1;
    }

    // Preparar datos para inserción
    const nuevoTiempo = {
      participante_id: participante_id,
      etapa_id: etapaIdNum,
      tiempo: tiempoNum,
      penalizacion: penalizacionNum,
      posicion: posicionCalculada,
      observaciones: observacionesFinales
    };

    console.log('Insertando tiempo:', nuevoTiempo);

    // Insertar el tiempo
    const { data, error } = await supabaseAdmin
      .from('tiempos')
      .insert(nuevoTiempo)
      .select(`
        *,
        participantes (
          id,
          nombre,
          apellidos,
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
          nombre,
          numero_etapa
        )
      `)
      .single();

    if (error) {
      console.error('Error insertando tiempo:', error);
      return res.status(500).json({ 
        error: 'Error registrando tiempo en la base de datos',
        details: error.message
      });
    }

    console.log('Tiempo insertado exitosamente:', data);

    // Recalcular posiciones si es necesario
    try {
      if (aplicar_bonificacion) {
        await recalcularPosicionesConBonificaciones(etapaIdNum);
      } else {
        await recalcularPosiciones(etapaIdNum);
      }
    } catch (recalcError) {
      console.error('Error recalculando posiciones (no crítico):', recalcError);
    }

    res.status(201).json({ 
      message: 'Tiempo registrado con éxito',
      tiempo: data,
      bonificacion_aplicada: aplicar_bonificacion && posicion && posicion <= 5 ? BONIFICACIONES[parseInt(posicion)] : 0
    });

  } catch (err) {
    console.error('=== ERROR COMPLETO EN SERVIDOR ===');
    console.error('Error:', err);
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Endpoint para aplicar bonificaciones a una etapa completa
exports.aplicarBonificacionesEtapa = async (req, res) => {
  try {
    const { etapaId } = req.params;
    
    console.log(`=== APLICANDO BONIFICACIONES A ETAPA ${etapaId} ===`);
    
    // Obtener todos los tiempos de la etapa ordenados por tiempo_final
    const { data: tiempos, error } = await supabaseAdmin
      .from('tiempos')
      .select(`
        id,
        tiempo,
        tiempo_final,
        penalizacion,
        posicion,
        participantes (
          nombre,
          apellidos,
          dorsal
        )
      `)
      .eq('etapa_id', etapaId)
      .order('tiempo_final', { ascending: true });

    if (error || !tiempos) {
      return res.status(500).json({ 
        error: 'Error obteniendo tiempos de la etapa',
        details: error?.message 
      });
    }

    if (tiempos.length === 0) {
      return res.status(400).json({ error: 'No hay tiempos registrados en esta etapa' });
    }

    const tiemposActualizados = [];
    
    // Aplicar bonificaciones a los primeros 5 puestos
    for (let i = 0; i < Math.min(5, tiempos.length); i++) {
      const tiempo = tiempos[i];
      const posicion = i + 1;
      
      // Calcular tiempo con bonificación
      const tiempoOriginal = tiempo.tiempo;
      const bonificacion = BONIFICACIONES[posicion];
      const tiempoConBonificacion = Math.max(0, tiempoOriginal - bonificacion);
      
      const observaciones = `Bonificación aplicada: ${bonificacion/1000}s (Posición ${posicion})`;
      
      // Actualizar en la base de datos
      const { data: tiempoActualizado, error: updateError } = await supabaseAdmin
        .from('tiempos')
        .update({
          tiempo: tiempoConBonificacion,
          posicion: posicion,
          observaciones: observaciones
        })
        .eq('id', tiempo.id)
        .select(`
          *,
          participantes (
            nombre,
            apellidos,
            dorsal
          )
        `)
        .single();

      if (updateError) {
        console.error(`Error actualizando tiempo ${tiempo.id}:`, updateError);
        continue;
      }

      tiemposActualizados.push({
        ...tiempoActualizado,
        bonificacion_aplicada: bonificacion,
        tiempo_original: tiempoOriginal,
        tiempo_final_nuevo: tiempoConBonificacion + (tiempo.penalizacion || 0)
      });
    }

    // Recalcular posiciones finales
    await recalcularPosiciones(etapaId);

    res.json({
      message: `Bonificaciones aplicadas correctamente a ${tiemposActualizados.length} participantes`,
      tiempos_actualizados: tiemposActualizados,
      total_tiempos: tiempos.length,
      bonificaciones_aplicadas: tiemposActualizados.length
    });

  } catch (err) {
    console.error('Error aplicando bonificaciones:', err);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: err.message
    });
  }
};

// Endpoint para obtener información de bonificaciones
exports.obtenerInfoBonificaciones = async (req, res) => {
  try {
    res.json({
      bonificaciones: Object.entries(BONIFICACIONES).map(([posicion, tiempo]) => ({
        posicion: parseInt(posicion),
        bonificacion_ms: tiempo,
        bonificacion_segundos: tiempo / 1000
      })),
      reglamento: "Bonificación a los 5 primeros puestos tanto en la ida como en la vuelta",
      descripcion: "1ro = 10s, 2do = 6s, 3ro = 4s, 4to = 2s, 5to = 1s"
    });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo información de bonificaciones' });
  }
};

// También agregar esta ruta en tiempoRoutes.js:
// router.get('/diagnostico', authenticateToken, tiempoController.diagnosticoCompleto);