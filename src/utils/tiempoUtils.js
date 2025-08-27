// utils/tiempoUtils.js
// Utilidades para manejo de tiempos en la aplicación

/**
 * Formatea tiempo en milisegundos a string legible
 * @param {number} timeMs - Tiempo en milisegundos
 * @returns {string} - Tiempo formateado (MM:SS.CC o HH:MM:SS.CC)
 */
export const formatTime = (timeMs) => {
  if (!timeMs || timeMs < 0) return '00:00.00';
  
  const hours = Math.floor(timeMs / 3600000);
  const minutes = Math.floor((timeMs % 3600000) / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const centiseconds = Math.floor((timeMs % 1000) / 10);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
};

/**
 * Parsea string de tiempo a milisegundos
 * @param {string} timeString - String en formato MM:SS.CC o HH:MM:SS.CC
 * @returns {number} - Tiempo en milisegundos
 */
export const parseTimeString = (timeString) => {
  if (!timeString) return 0;
  
  const parts = timeString.split(':');
  let hours = 0, minutes = 0, seconds = 0, centiseconds = 0;
  
  if (parts.length === 3) {
    // HH:MM:SS.CC
    hours = parseInt(parts[0]) || 0;
    minutes = parseInt(parts[1]) || 0;
    const secondsParts = parts[2].split('.');
    seconds = parseInt(secondsParts[0]) || 0;
    centiseconds = parseInt(secondsParts[1]) || 0;
  } else if (parts.length === 2) {
    // MM:SS.CC
    minutes = parseInt(parts[0]) || 0;
    const secondsParts = parts[1].split('.');
    seconds = parseInt(secondsParts[0]) || 0;
    centiseconds = parseInt(secondsParts[1]) || 0;
  }
  
  return (hours * 3600000) + (minutes * 60000) + (seconds * 1000) + (centiseconds * 10);
};

/**
 * Valida formato de tiempo
 * @param {string} timeString - String de tiempo a validar
 * @returns {boolean} - true si es válido
 */
export const isValidTimeFormat = (timeString) => {
  if (!timeString) return false;
  
  // Expresión regular para MM:SS.CC o HH:MM:SS.CC
  const timeRegex = /^(\d{1,2}:)?(\d{1,2}):(\d{2})\.(\d{2})$/;
  return timeRegex.test(timeString);
};

/**
 * Calcula diferencia entre dos tiempos
 * @param {number} tiempo1 - Primer tiempo en ms
 * @param {number} tiempo2 - Segundo tiempo en ms
 * @returns {number} - Diferencia en ms
 */
export const calcularDiferencia = (tiempo1, tiempo2) => {
  return Math.abs(tiempo1 - tiempo2);
};

/**
 * Convierte hora en formato HH:MM a minutos desde medianoche
 * @param {string} hora - Hora en formato HH:MM
 * @returns {number} - Minutos desde medianoche
 */
export const horaToMinutos = (hora) => {
  if (!hora) return 0;
  const [hours, minutes] = hora.split(':').map(Number);
  return (hours * 60) + minutes;
};

/**
 * Calcula diferencia de salida entre categorías
 * @param {string} horaSalida - Hora de salida de la categoría (HH:MM)
 * @param {string} horaBase - Hora base de referencia (HH:MM)
 * @returns {number} - Diferencia en milisegundos
 */
export const calcularDiferenciaSalida = (horaSalida, horaBase) => {
  if (!horaSalida || !horaBase) return 0;
  
  const minutosCategoria = horaToMinutos(horaSalida);
  const minutosBase = horaToMinutos(horaBase);
  const diferenciaMinutos = minutosCategoria - minutosBase;
  
  return diferenciaMinutos * 60 * 1000; // Convertir a milisegundos
};

/**
 * Ordena array de tiempos por diferentes criterios
 * @param {Array} tiempos - Array de tiempos
 * @param {string} criterio - Criterio de ordenamiento
 * @param {string} direccion - 'asc' o 'desc'
 * @returns {Array} - Array ordenado
 */
export const ordenarTiempos = (tiempos, criterio = 'tiempo_final', direccion = 'asc') => {
  return [...tiempos].sort((a, b) => {
    let valorA, valorB;
    
    switch (criterio) {
      case 'participante':
        valorA = `${a.participantes?.nombre} ${a.participantes?.apellidos}`.toLowerCase();
        valorB = `${b.participantes?.nombre} ${b.participantes?.apellidos}`.toLowerCase();
        break;
      case 'dorsal':
        valorA = parseInt(a.participantes?.dorsal) || 0;
        valorB = parseInt(b.participantes?.dorsal) || 0;
        break;
      case 'etapa':
        valorA = a.etapas?.numero_etapa || 0;
        valorB = b.etapas?.numero_etapa || 0;
        break;
      case 'tiempo_final':
        valorA = a.tiempo_final || 0;
        valorB = b.tiempo_final || 0;
        break;
      case 'posicion':
        valorA = a.posicion || 0;
        valorB = b.posicion || 0;
        break;
      case 'fecha':
        valorA = new Date(a.created_at || 0);
        valorB = new Date(b.created_at || 0);
        break;
      case 'categoria':
        valorA = a.participantes?.categorias?.nombre?.toLowerCase() || '';
        valorB = b.participantes?.categorias?.nombre?.toLowerCase() || '';
        break;
      default:
        valorA = a[criterio] || '';
        valorB = b[criterio] || '';
    }
    
    if (valorA < valorB) {
      return direccion === 'asc' ? -1 : 1;
    }
    if (valorA > valorB) {
      return direccion === 'asc' ? 1 : -1;
    }
    return 0;
  });
};

/**
 * Filtra tiempos por múltiples criterios
 * @param {Array} tiempos - Array de tiempos
 * @param {Object} filtros - Objeto con filtros a aplicar
 * @returns {Array} - Array filtrado
 */
export const filtrarTiempos = (tiempos, filtros = {}) => {
  return tiempos.filter(tiempo => {
    // Filtro por etapa
    if (filtros.etapaId && tiempo.etapa_id !== parseInt(filtros.etapaId)) {
      return false;
    }
    
    // Filtro por categoría
    if (filtros.categoriaId && tiempo.participantes?.categoria_id !== filtros.categoriaId) {
      return false;
    }
    
    // Filtro por fecha desde
    if (filtros.fechaDesde) {
      const fechaTiempo = new Date(tiempo.created_at).toISOString().split('T')[0];
      if (fechaTiempo < filtros.fechaDesde) {
        return false;
      }
    }
    
    // Filtro por fecha hasta
    if (filtros.fechaHasta) {
      const fechaTiempo = new Date(tiempo.created_at).toISOString().split('T')[0];
      if (fechaTiempo > filtros.fechaHasta) {
        return false;
      }
    }
    
    // Filtro por búsqueda de texto
    if (filtros.busqueda) {
      const busqueda = filtros.busqueda.toLowerCase();
      const participante = tiempo.participantes;
      const coincide = 
        participante?.nombre?.toLowerCase().includes(busqueda) ||
        participante?.apellidos?.toLowerCase().includes(busqueda) ||
        participante?.dorsal?.toLowerCase().includes(busqueda) ||
        participante?.ci?.toLowerCase().includes(busqueda) ||
        tiempo.etapas?.nombre?.toLowerCase().includes(busqueda);
      
      if (!coincide) {
        return false;
      }
    }
    
    return true;
  });
};

/**
 * Calcula estadísticas de un array de tiempos
 * @param {Array} tiempos - Array de tiempos
 * @returns {Object} - Objeto con estadísticas
 */
export const calcularEstadisticas = (tiempos) => {
  if (!tiempos || tiempos.length === 0) {
    return {
      totalTiempos: 0,
      totalParticipantes: 0,
      tiempoPorEtapa: [],
      tiempoPorCategoria: [],
      tiempoMejor: null,
      tiempoPromedio: null,
      tiempoPeor: null
    };
  }
  
  // Participantes únicos
  const participantesUnicos = new Set(tiempos.map(t => t.participante_id));
  
  // Tiempos por etapa
  const tiempoPorEtapa = {};
  tiempos.forEach(tiempo => {
    const etapaId = tiempo.etapa_id;
    if (!tiempoPorEtapa[etapaId]) {
      tiempoPorEtapa[etapaId] = {
        id: etapaId,
        count: 0,
        etapa: `Etapa ${tiempo.etapas?.numero_etapa}: ${tiempo.etapas?.nombre}` || `Etapa ${etapaId}`,
        tiempos: []
      };
    }
    tiempoPorEtapa[etapaId].count++;
    tiempoPorEtapa[etapaId].tiempos.push(tiempo.tiempo_final);
  });
  
  // Tiempos por categoría
  const tiempoPorCategoria = {};
  tiempos.forEach(tiempo => {
    const categoriaId = tiempo.participantes?.categoria_id;
    if (categoriaId) {
      if (!tiempoPorCategoria[categoriaId]) {
        tiempoPorCategoria[categoriaId] = {
          id: categoriaId,
          count: 0,
          categoria: tiempo.participantes?.categorias?.nombre || 'Sin categoría',
          tiempos: []
        };
      }
      tiempoPorCategoria[categoriaId].count++;
      tiempoPorCategoria[categoriaId].tiempos.push(tiempo.tiempo_final);
    }
  });
  
  // Estadísticas de tiempos
  const tiemposFinales = tiempos.map(t => t.tiempo_final).filter(t => t > 0);
  const tiempoMejor = tiemposFinales.length > 0 ? Math.min(...tiemposFinales) : null;
  const tiempoPeor = tiemposFinales.length > 0 ? Math.max(...tiemposFinales) : null;
  const tiempoPromedio = tiemposFinales.length > 0 
    ? tiemposFinales.reduce((sum, t) => sum + t, 0) / tiemposFinales.length 
    : null;
  
  return {
    totalTiempos: tiempos.length,
    totalParticipantes: participantesUnicos.size,
    tiempoPorEtapa: Object.values(tiempoPorEtapa),
    tiempoPorCategoria: Object.values(tiempoPorCategoria),
    tiempoMejor,
    tiempoPromedio: tiempoPromedio ? Math.round(tiempoPromedio) : null,
    tiempoPeor
  };
};

/**
 * Genera un reporte de tiempos en formato CSV
 * @param {Array} tiempos - Array de tiempos
 * @returns {string} - Contenido CSV
 */
export const generarCSV = (tiempos) => {
  const headers = [
    'Posicion',
    'Dorsal',
    'Nombre',
    'Apellidos',
    'CI',
    'Categoria',
    'Etapa',
    'Tiempo_Cronometro',
    'Penalizacion',
    'Tiempo_Final',
    'Observaciones',
    'Fecha_Registro'
  ];
  
  const rows = tiempos.map(tiempo => [
    tiempo.posicion || '',
    tiempo.participantes?.dorsal || '',
    tiempo.participantes?.nombre || '',
    tiempo.participantes?.apellidos || '',
    tiempo.participantes?.ci || '',
    tiempo.participantes?.categorias?.nombre || '',
    `Etapa ${tiempo.etapas?.numero_etapa}: ${tiempo.etapas?.nombre}` || '',
    formatTime(tiempo.tiempo),
    formatTime(tiempo.penalizacion || 0),
    formatTime(tiempo.tiempo_final),
    tiempo.observaciones || '',
    tiempo.created_at ? new Date(tiempo.created_at).toLocaleString() : ''
  ]);
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');
  
  return csvContent;
};

/**
 * Descarga un archivo CSV
 * @param {string} content - Contenido del CSV
 * @param {string} filename - Nombre del archivo
 */
export const descargarCSV = (content, filename = 'tiempos.csv') => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Valida los datos de un tiempo antes de guardar
 * @param {Object} tiempoData - Datos del tiempo
 * @returns {Object} - Resultado de validación
 */
export const validarTiempo = (tiempoData) => {
  const errores = [];
  
  // Validar participante
  if (!tiempoData.participante_id) {
    errores.push('Debe seleccionar un participante');
  }
  
  // Validar etapa
  if (!tiempoData.etapa_id) {
    errores.push('Debe seleccionar una etapa');
  }
  
  // Validar tiempo
  if (!tiempoData.tiempo) {
    errores.push('El tiempo es requerido');
  } else if (typeof tiempoData.tiempo === 'string') {
    if (!isValidTimeFormat(tiempoData.tiempo)) {
      errores.push('Formato de tiempo inválido. Use MM:SS.CC o HH:MM:SS.CC');
    } else {
      const tiempoMs = parseTimeString(tiempoData.tiempo);
      if (tiempoMs <= 0) {
        errores.push('El tiempo debe ser mayor a 0');
      }
    }
  } else if (typeof tiempoData.tiempo === 'number') {
    if (tiempoData.tiempo <= 0) {
      errores.push('El tiempo debe ser mayor a 0');
    }
  }
  
  // Validar penalización
  if (tiempoData.penalizacion) {
    if (typeof tiempoData.penalizacion === 'string') {
      if (!isValidTimeFormat(tiempoData.penalizacion)) {
        errores.push('Formato de penalización inválido. Use MM:SS.CC o HH:MM:SS.CC');
      } else {
        const penalizacionMs = parseTimeString(tiempoData.penalizacion);
        if (penalizacionMs < 0) {
          errores.push('La penalización no puede ser negativa');
        }
      }
    } else if (typeof tiempoData.penalizacion === 'number') {
      if (tiempoData.penalizacion < 0) {
        errores.push('La penalización no puede ser negativa');
      }
    }
  }
  
  return {
    esValido: errores.length === 0,
    errores
  };
};

/**
 * Normaliza los datos de tiempo para envío al servidor
 * @param {Object} tiempoData - Datos del tiempo
 * @returns {Object} - Datos normalizados
 */
export const normalizarTiempoData = (tiempoData) => {
  const datosNormalizados = { ...tiempoData };
  
  // Convertir tiempo a milisegundos si es string
  if (typeof datosNormalizados.tiempo === 'string') {
    datosNormalizados.tiempo = parseTimeString(datosNormalizados.tiempo);
  }
  
  // Convertir penalización a milisegundos si es string
  if (typeof datosNormalizados.penalizacion === 'string') {
    datosNormalizados.penalizacion = parseTimeString(datosNormalizados.penalizacion);
  } else if (!datosNormalizados.penalizacion) {
    datosNormalizados.penalizacion = 0;
  }
  
  // Asegurar que etapa_id sea número
  if (datosNormalizados.etapa_id) {
    datosNormalizados.etapa_id = parseInt(datosNormalizados.etapa_id);
  }
  
  // Limpiar observaciones vacías
  if (!datosNormalizados.observaciones || datosNormalizados.observaciones.trim() === '') {
    datosNormalizados.observaciones = null;
  }
  
  return datosNormalizados;
};

export default {
  formatTime,
  parseTimeString,
  isValidTimeFormat,
  calcularDiferencia,
  horaToMinutos,
  calcularDiferenciaSalida,
  ordenarTiempos,
  filtrarTiempos,
  calcularEstadisticas,
  generarCSV,
  descargarCSV,
  validarTiempo,
  normalizarTiempoData
};