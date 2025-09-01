const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Obtener todas las categorías
exports.getCategorias = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('hora_salida', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ categorias: data });
  } catch (err) {
    console.error('Error obteniendo categorías:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener todos los equipos
exports.getEquipos = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('equipos')
      .select('*');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ equipos: data });
  } catch (err) {
    console.error('Error obteniendo equipos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener un participante por ID
exports.getParticipanteById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('participantes')
      .select(`
        *,
        categorias(id, nombre)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Participante no encontrado' });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json({ participante: data });
  } catch (err) {
    console.error('Error obteniendo participante:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// NUEVO: Obtener participante por dorsal
exports.getParticipanteByDorsal = async (req, res) => {
  try {
    const { dorsal } = req.params;

    if (!dorsal) {
      return res.status(400).json({ error: 'Dorsal es requerido' });
    }

    console.log('Buscando participante con dorsal:', dorsal);

    const { data, error } = await supabase
      .from('participantes')
      .select(`
        id,
        nombre,
        apellidos,
        ci,
        dorsal,
        categoria_id,
        categorias(id, nombre)
      `)
      .eq('dorsal', dorsal)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('Participante no encontrado con dorsal:', dorsal);
        return res.status(404).json({ error: 'Participante no encontrado' });
      }
      return res.status(500).json({ error: error.message });
    }

    console.log('Participante encontrado:', data);
    res.json({ participante: data });
  } catch (err) {
    console.error('Error obteniendo participante por dorsal:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar participante
exports.updateParticipante = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('=== updateParticipante - Inicio ===');
    console.log('ID:', id);
    console.log('Body:', req.body);
    console.log('Files:', req.files);

    // Verificar si se recibieron datos
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('Error: No se recibieron datos');
      return res.status(400).json({ error: 'No se recibieron datos para actualizar' });
    }

    const {
      nombre,
      apellidos,
      ci,
      fecha_nacimiento,
      dorsal,
      categoria_id,
      equipo,
      metodo_pago,
      comprobante_url,
      comunidad,
      foto_anverso_url,
      foto_reverso_url,
      autorizacion_url
    } = req.body;

    const files = req.files;

    // Validar campos requeridos
    if (!nombre || !apellidos || !ci || !fecha_nacimiento || !dorsal || !categoria_id || !metodo_pago) {
      console.log('Error: Faltan campos requeridos');
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Validar año de nacimiento - CORREGIDO: solo se admiten participantes nacidos en 2011 o antes
    const birthDate = new Date(fecha_nacimiento);
    if (birthDate.getFullYear() <= 2011) {
      console.log('Error: Año posterior a 2011');
      return res.status(400).json({ error: 'Solo se admiten participantes nacidos en el año 2011 o anteriores' });
    }

    // Calcular edad para validar autorización
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Verificar si el CI o dorsal ya existe en otro participante
    console.log('Verificando CI y dorsal existentes...');
    const { data: existingParticipant, error: checkError } = await supabase
      .from('participantes')
      .select('id, ci, dorsal')
      .or(`ci.eq.${ci.toUpperCase()},dorsal.eq.${dorsal}`)
      .neq('id', id);

    if (checkError) {
      console.error('Error verificando participante existente:', checkError);
      return res.status(500).json({ error: 'Error verificando participante existente' });
    }

    if (existingParticipant && existingParticipant.length > 0) {
      const existing = existingParticipant[0];
      if (existing.ci === ci.toUpperCase()) {
        console.log('Error: CI ya existe en otro participante');
        return res.status(400).json({ error: 'Ya existe otro participante con este CI' });
      }
      if (existing.dorsal === dorsal) {
        console.log('Error: Dorsal ya existe en otro participante');
        return res.status(400).json({ error: 'Ya existe otro participante con este dorsal' });
      }
    }

    // Obtener datos actuales del participante
    const { data: currentParticipant, error: getCurrentError } = await supabase
      .from('participantes')
      .select('*')
      .eq('id', id)
      .single();

    if (getCurrentError) {
      console.error('Error obteniendo participante actual:', getCurrentError);
      return res.status(500).json({ error: 'Error obteniendo datos actuales del participante' });
    }

    if (!currentParticipant) {
      return res.status(404).json({ error: 'Participante no encontrado' });
    }

    // Preparar datos para actualización - TODO EN MAYÚSCULAS
    let participanteActualizado = {
      nombre: nombre.toUpperCase(),
      apellidos: apellidos.toUpperCase(),
      ci: ci.toUpperCase(),
      fecha_nacimiento,
      dorsal: dorsal, // Mantener como string para preservar ceros iniciales
      categoria_id: categoria_id,
      equipo: equipo ? equipo.toUpperCase() : null,
      metodo_pago: metodo_pago.toUpperCase(),
      comunidad: comunidad ? comunidad.toUpperCase() : null,
      // Mantener URLs existentes por defecto
      comprobante_url: comprobante_url || currentParticipant.comprobante_url,
      foto_anverso_url: foto_anverso_url || currentParticipant.foto_anverso_url,
      foto_reverso_url: foto_reverso_url || currentParticipant.foto_reverso_url,
      autorizacion_url: autorizacion_url || currentParticipant.autorizacion_url
    };

    // Si hay archivos nuevos, subirlos
    if (files && Object.keys(files).length > 0) {
      console.log('Procesando archivos nuevos...');

      // Validar que si se sube una foto del CI, se suban ambas
      if ((files.foto_anverso && !files.foto_reverso) || (!files.foto_anverso && files.foto_reverso)) {
        console.log('Error: Fotos de CI incompletas');
        return res.status(400).json({ 
          error: 'Si actualiza las fotos del CI, debe subir tanto el anverso como el reverso' 
        });
      }

      // Validar autorización para menores de edad
      if (age < 18 && !files.autorizacion && !currentParticipant.autorizacion_url) {
        console.log('Error: Menor de edad sin autorización');
        return res.status(400).json({ 
          error: 'Para participantes menores de 18 años es obligatorio tener la autorización' 
        });
      }

      const uploadPromises = [];
      const filesToDelete = []; // Para eliminar archivos antiguos si es necesario

      // Subir comprobante
      if (files.comprobante && files.comprobante[0]) {
        const file = files.comprobante[0];
        const fileExt = file.originalname.split('.').pop();
        const fileName = `comprobantes/${ci.toUpperCase()}_comprobante_${Date.now()}.${fileExt}`;

        if (currentParticipant.comprobante_url) {
          filesToDelete.push(currentParticipant.comprobante_url);
        }

        uploadPromises.push(
          supabase.storage
            .from('participantes')
            .upload(fileName, file.buffer, {
              contentType: file.mimetype,
              cacheControl: '3600',
              upsert: false,
            })
            .then(({ data, error }) => {
              if (error) throw error;
              participanteActualizado.comprobante_url = data.path;
              console.log('Comprobante actualizado:', data.path);
            })
        );
      }

      // Subir foto anverso CI
      if (files.foto_anverso && files.foto_anverso[0]) {
        const file = files.foto_anverso[0];
        const fileExt = file.originalname.split('.').pop();
        const fileName = `ci_fotos/${ci.toUpperCase()}_anverso_${Date.now()}.${fileExt}`;

        if (currentParticipant.foto_anverso_url) {
          filesToDelete.push(currentParticipant.foto_anverso_url);
        }

        uploadPromises.push(
          supabase.storage
            .from('participantes')
            .upload(fileName, file.buffer, {
              contentType: file.mimetype,
              cacheControl: '3600',
              upsert: false,
            })
            .then(({ data, error }) => {
              if (error) throw error;
              participanteActualizado.foto_anverso_url = data.path;
              console.log('Foto anverso actualizada:', data.path);
            })
        );
      }

      // Subir foto reverso CI
      if (files.foto_reverso && files.foto_reverso[0]) {
        const file = files.foto_reverso[0];
        const fileExt = file.originalname.split('.').pop();
        const fileName = `ci_fotos/${ci.toUpperCase()}_reverso_${Date.now()}.${fileExt}`;

        if (currentParticipant.foto_reverso_url) {
          filesToDelete.push(currentParticipant.foto_reverso_url);
        }

        uploadPromises.push(
          supabase.storage
            .from('participantes')
            .upload(fileName, file.buffer, {
              contentType: file.mimetype,
              cacheControl: '3600',
              upsert: false,
            })
            .then(({ data, error }) => {
              if (error) throw error;
              participanteActualizado.foto_reverso_url = data.path;
              console.log('Foto reverso actualizada:', data.path);
            })
        );
      }

      // Subir autorización
      if (files.autorizacion && files.autorizacion[0]) {
        const file = files.autorizacion[0];
        const fileExt = file.originalname.split('.').pop();
        const fileName = `autorizaciones/${ci.toUpperCase()}_autorizacion_${Date.now()}.${fileExt}`;

        if (currentParticipant.autorizacion_url) {
          filesToDelete.push(currentParticipant.autorizacion_url);
        }

        uploadPromises.push(
          supabase.storage
            .from('participantes')
            .upload(fileName, file.buffer, {
              contentType: file.mimetype,
              cacheControl: '3600',
              upsert: false,
            })
            .then(({ data, error }) => {
              if (error) throw error;
              participanteActualizado.autorizacion_url = data.path;
              console.log('Autorización actualizada:', data.path);
            })
        );
      }

      // Esperar a que se suban todos los archivos
      try {
        console.log('Esperando subida de archivos...');
        await Promise.all(uploadPromises);
        console.log('Todos los archivos subidos exitosamente');

        // Eliminar archivos antiguos
        if (filesToDelete.length > 0) {
          try {
            await supabase.storage
              .from('participantes')
              .remove(filesToDelete);
            console.log('Archivos antiguos eliminados');
          } catch (deleteError) {
            console.warn('Error eliminando archivos antiguos:', deleteError);
          }
        }
      } catch (uploadError) {
        console.error('Error en subida de archivos:', uploadError);
        return res.status(500).json({ 
          error: 'Error subiendo archivos: ' + uploadError.message 
        });
      }
    } else {
      // Sin archivos nuevos, validar autorización existente para menores
      if (age < 18 && !currentParticipant.autorizacion_url) {
        console.log('Error: Menor de edad sin autorización existente');
        return res.status(400).json({ 
          error: 'Para participantes menores de 18 años es obligatorio tener la autorización' 
        });
      }
    }

    // Actualizar participante en la base de datos
    console.log('Actualizando participante en base de datos...');
    console.log('Datos finales:', participanteActualizado);

    const { data, error } = await supabase
      .from('participantes')
      .update(participanteActualizado)
      .eq('id', id)
      .select(`
        *,
        categorias(nombre)
      `);

    if (error) {
      console.error('Error actualizando participante en BD:', error);
      return res.status(500).json({ error: 'Error actualizando participante: ' + error.message });
    }

    if (!data || data.length === 0) {
      console.log('Error: Participante no encontrado para actualizar');
      return res.status(404).json({ error: 'Participante no encontrado' });
    }

    console.log('Participante actualizado exitosamente:', data[0]);

    const successMessage = age < 18 
      ? `Participante ${nombre.toUpperCase()} ${apellidos.toUpperCase()} (menor de edad) actualizado correctamente con dorsal ${dorsal}`
      : `Participante ${nombre.toUpperCase()} ${apellidos.toUpperCase()} actualizado correctamente con dorsal ${dorsal}`;

    res.json({ 
      message: successMessage,
      participante: data[0]
    });

  } catch (err) {
    console.error('Error general actualizando participante:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ 
      error: 'Error interno del servidor: ' + err.message 
    });
  }
};

// Crear participante público (sin autenticación)
exports.createParticipantePublico = async (req, res) => {
  try {
    console.log('=== createParticipantePublico - Inicio ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files);

    const {
      nombre,
      apellidos,
      ci,
      fecha_nacimiento,
      categoria_id,
      equipo,
      metodo_pago,
      comunidad
    } = req.body;

    const files = req.files;

    // Validar campos requeridos
    if (!nombre || !apellidos || !ci || !fecha_nacimiento || !categoria_id || !metodo_pago || !comunidad) {
      console.log('Error: Faltan campos requeridos');
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Validar que hay comprobante y fotos del CI
    if (!files) {
      console.log('Error: No se recibieron archivos');
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }

    if (!files.comprobante || !files.foto_anverso || !files.foto_reverso) {
      console.log('Error: Faltan archivos requeridos');
      console.log('Comprobante:', !!files.comprobante);
      console.log('Foto anverso:', !!files.foto_anverso);
      console.log('Foto reverso:', !!files.foto_reverso);
      return res.status(400).json({ 
        error: 'Debe subir el comprobante de pago y las fotos del CI (anverso y reverso)' 
      });
    }

    // Calcular edad basada en fecha de nacimiento
    const birthDate = new Date(fecha_nacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Validar año mínimo - CORREGIDO: solo se admiten participantes nacidos en 2011 o antes
    if (birthDate.getFullYear() <= 2011) {
      console.log('Error: Año posterior a 2011');
      return res.status(400).json({ error: 'Solo se admiten participantes nacidos en el año 2011 o anteriores' });
    }

    // Validar autorización para menores de edad
    if (age < 18 && (!files.autorizacion || !files.autorizacion[0])) {
      console.log('Error: Menor de edad sin autorización');
      return res.status(400).json({ error: 'Para participantes menores de 18 años es obligatorio subir la autorización firmada por los padres/tutores' });
    }

    // Verificar si el CI ya existe
    console.log('Verificando CI existente...');
    const { data: existingParticipant, error: checkError } = await supabase
      .from('participantes')
      .select('ci')
      .eq('ci', ci.toUpperCase());

    if (checkError) {
      console.error('Error verificando CI:', checkError);
      return res.status(500).json({ error: 'Error verificando participante existente' });
    }

    if (existingParticipant && existingParticipant.length > 0) {
      console.log('Error: CI ya existe');
      return res.status(400).json({ error: 'Ya existe un participante con este CI' });
    }

    // Subir archivos
    console.log('Iniciando subida de archivos...');
    const uploadPromises = [];
    let comprobante_url = null;
    let foto_anverso_url = null;
    let foto_reverso_url = null;
    let autorizacion_url = null;

    // Subir comprobante
    if (files.comprobante && files.comprobante[0]) {
      const file = files.comprobante[0];
      const fileExt = file.originalname.split('.').pop();
      const fileName = `comprobantes/${ci.toUpperCase()}_comprobante_${Date.now()}.${fileExt}`;

      uploadPromises.push(
        supabase.storage
          .from('participantes')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error subiendo comprobante:', error);
              throw error;
            }
            console.log('Comprobante subido:', data.path);
            comprobante_url = data.path;
          })
      );
    }

    // Subir foto anverso CI
    if (files.foto_anverso && files.foto_anverso[0]) {
      const file = files.foto_anverso[0];
      const fileExt = file.originalname.split('.').pop();
      const fileName = `ci_fotos/${ci.toUpperCase()}_anverso_${Date.now()}.${fileExt}`;

      uploadPromises.push(
        supabase.storage
          .from('participantes')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error subiendo foto anverso:', error);
              throw error;
            }
            console.log('Foto anverso subida:', data.path);
            foto_anverso_url = data.path;
          })
      );
    }

    // Subir foto reverso CI
    if (files.foto_reverso && files.foto_reverso[0]) {
      const file = files.foto_reverso[0];
      const fileExt = file.originalname.split('.').pop();
      const fileName = `ci_fotos/${ci.toUpperCase()}_reverso_${Date.now()}.${fileExt}`;

      uploadPromises.push(
        supabase.storage
          .from('participantes')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error subiendo foto reverso:', error);
              throw error;
            }
            console.log('Foto reverso subida:', data.path);
            foto_reverso_url = data.path;
          })
      );
    }

    // Subir autorización
    if (files.autorizacion && files.autorizacion[0]) {
      const file = files.autorizacion[0];
      const fileExt = file.originalname.split('.').pop();
      const fileName = `autorizaciones/${ci.toUpperCase()}_autorizacion_${Date.now()}.${fileExt}`;

      uploadPromises.push(
        supabase.storage
          .from('participantes')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error subiendo autorización:', error);
              throw error;
            }
            console.log('Autorización subida:', data.path);
            autorizacion_url = data.path;
          })
      );
    }

    // Esperar a que se suban todos los archivos
    try {
      console.log('Esperando subida de archivos...');
      await Promise.all(uploadPromises);
      console.log('Todos los archivos subidos exitosamente');
    } catch (uploadError) {
      console.error('Error en subida de archivos:', uploadError);
      return res.status(500).json({ error: 'Error subiendo archivos: ' + uploadError.message });
    }

    // Crear participante - TODO EN MAYÚSCULAS
    console.log('Creando participante en base de datos...');
    const nuevoParticipante = {
      nombre: nombre.toUpperCase(),
      apellidos: apellidos.toUpperCase(),
      ci: ci.toUpperCase(),
      fecha_nacimiento,
      dorsal: req.body.dorsal || null, // Mantener como string si viene en el body
      categoria_id,
      equipo: equipo ? equipo.toUpperCase() : null,
      metodo_pago: metodo_pago.toUpperCase(),
      comprobante_url,
      comunidad: comunidad.toUpperCase(),
      foto_anverso_url,
      foto_reverso_url,
      autorizacion_url
    };

    console.log('Datos del participante:', nuevoParticipante);

    const { data, error } = await supabase
      .from('participantes')
      .insert(nuevoParticipante)
      .select(`
        *,
        categorias(nombre)
      `);

    if (error) {
      console.error('Error insertando participante:', error);
      return res.status(500).json({ error: 'Error registrando participante: ' + error.message });
    }

    console.log('Participante creado exitosamente:', data[0]);

    res.status(201).json({ 
      message: 'Participante registrado con éxito. El número de dorsal será asignado posteriormente.',
      participante: data[0]
    });

  } catch (err) {
    console.error('Error general creando participante público:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ 
      error: 'Error interno del servidor: ' + err.message 
    });
  }
};

// Eliminar participante
exports.deleteParticipante = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el participante existe
    const { data: existingParticipant, error: checkError } = await supabase
      .from('participantes')
      .select('*')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Participante no encontrado' });
      }
      return res.status(500).json({ error: 'Error verificando participante' });
    }

    // Eliminar archivos del storage si existen
    const filesToDelete = [];
    if (existingParticipant.comprobante_url) filesToDelete.push(existingParticipant.comprobante_url);
    if (existingParticipant.foto_anverso_url) filesToDelete.push(existingParticipant.foto_anverso_url);
    if (existingParticipant.foto_reverso_url) filesToDelete.push(existingParticipant.foto_reverso_url);
    if (existingParticipant.autorizacion_url) filesToDelete.push(existingParticipant.autorizacion_url);

    if (filesToDelete.length > 0) {
      try {
        await supabase.storage
          .from('participantes')
          .remove(filesToDelete);
      } catch (storageError) {
        console.warn('Error eliminando archivos del storage:', storageError);
      }
    }

    // Eliminar el participante
    const { error } = await supabase
      .from('participantes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando participante:', error);
      return res.status(500).json({ error: 'Error eliminando participante' });
    }

    res.json({ 
      message: 'Participante eliminado con éxito',
      participante: existingParticipant
    });
  } catch (err) {
    console.error('Error eliminando participante:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Subir archivos
exports.uploadArchivos = async (req, res) => {
  try {
    const { ci } = req.body;
    const files = req.files;

    if (!files || Object.keys(files).length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron archivos' });
    }

    // Validar tipos de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    
    const uploadResults = {};
    const uploadPromises = [];

    Object.keys(files).forEach(fieldName => {
      if (files[fieldName] && files[fieldName][0]) {
        const file = files[fieldName][0];
        
        if (!allowedTypes.includes(file.mimetype)) {
          throw new Error(`Tipo de archivo no permitido para ${fieldName}`);
        }

        const fileExt = file.originalname.split('.').pop();
        let fileName;
        
        // Definir carpeta según tipo de archivo
        switch(fieldName) {
          case 'comprobante':
            fileName = `comprobantes/${ci.toUpperCase()}_${fieldName}_${Date.now()}.${fileExt}`;
            break;
          case 'foto_anverso':
          case 'foto_reverso':
            fileName = `ci_fotos/${ci.toUpperCase()}_${fieldName}_${Date.now()}.${fileExt}`;
            break;
          case 'autorizacion':
            fileName = `autorizaciones/${ci.toUpperCase()}_${fieldName}_${Date.now()}.${fileExt}`;
            break;
          default:
            fileName = `${fieldName}/${ci.toUpperCase()}_${fieldName}_${Date.now()}.${fileExt}`;
        }

        uploadPromises.push(
          supabase.storage
            .from('participantes')
            .upload(fileName, file.buffer, {
              contentType: file.mimetype,
              cacheControl: '3600',
              upsert: false,
            })
            .then(({ data, error }) => {
              if (error) throw error;
              uploadResults[fieldName] = data.path;
            })
        );
      }
    });

    await Promise.all(uploadPromises);

    res.json({ paths: uploadResults });
  } catch (err) {
    console.error('Error subiendo archivos:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
};

// Crear nuevo participante (admin)
exports.createParticipanteAdmin = async (req, res) => {
  try {
    console.log('=== createParticipanteAdmin - Inicio ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files);

    const {
      nombre,
      apellidos,
      ci,
      fecha_nacimiento,
      dorsal,
      categoria_id,
      equipo,
      metodo_pago,
      comunidad
    } = req.body;

    const files = req.files;

    // Validar campos requeridos (incluye dorsal)
    if (!nombre || !apellidos || !ci || !fecha_nacimiento || !categoria_id || !metodo_pago || !comunidad || !dorsal) {
      console.log('Error: Faltan campos requeridos');
      return res.status(400).json({ error: 'Faltan campos requeridos (incluye dorsal)' });
    }

    // Validar que hay comprobante y fotos del CI
    if (!files) {
      console.log('Error: No se recibieron archivos');
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }

    if (!files.comprobante || !files.foto_anverso || !files.foto_reverso) {
      console.log('Error: Faltan archivos requeridos');
      console.log('Comprobante:', !!files.comprobante);
      console.log('Foto anverso:', !!files.foto_anverso);
      console.log('Foto reverso:', !!files.foto_reverso);
      return res.status(400).json({ 
        error: 'Debe subir el comprobante de pago y las fotos del CI (anverso y reverso)' 
      });
    }

    // Calcular edad basada en fecha de nacimiento
    const birthDate = new Date(fecha_nacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Validar año mínimo - CORREGIDO: solo se admiten participantes nacidos en 2011 o antes
    if (birthDate.getFullYear() <= 2011) {
      console.log('Error: Año posterior a 2011');
      return res.status(400).json({ error: 'Solo se admiten participantes nacidos en el año 2011 o anteriores' });
    }

    // Validar autorización para menores de edad
    if (age < 18 && (!files.autorizacion || !files.autorizacion[0])) {
      console.log('Error: Menor de edad sin autorización');
      return res.status(400).json({ error: 'Para participantes menores de 18 años es obligatorio subir la autorización firmada por los padres/tutores' });
    }

    // Verificar si el CI o dorsal ya existe
    console.log('Verificando CI y dorsal existentes...');
    const { data: existingParticipant, error: checkError } = await supabase
      .from('participantes')
      .select('ci, dorsal')
      .or(`ci.eq.${ci.toUpperCase()},dorsal.eq.${dorsal}`);

    if (checkError) {
      console.error('Error verificando participante:', checkError);
      return res.status(500).json({ error: 'Error verificando participante existente' });
    }

    if (existingParticipant && existingParticipant.length > 0) {
      const existing = existingParticipant[0];
      if (existing.ci === ci.toUpperCase()) {
        console.log('Error: CI ya existe');
        return res.status(400).json({ error: 'Ya existe un participante con este CI' });
      }
      if (existing.dorsal === dorsal) {
        console.log('Error: Dorsal ya existe');
        return res.status(400).json({ error: 'Ya existe un participante con este dorsal' });
      }
    }

    // Subir archivos
    console.log('Iniciando subida de archivos...');
    const uploadPromises = [];
    let comprobante_url = null;
    let foto_anverso_url = null;
    let foto_reverso_url = null;
    let autorizacion_url = null;

    // Subir comprobante
    if (files.comprobante && files.comprobante[0]) {
      const file = files.comprobante[0];
      const fileExt = file.originalname.split('.').pop();
      const fileName = `comprobantes/${ci.toUpperCase()}_comprobante_${Date.now()}.${fileExt}`;

      uploadPromises.push(
        supabase.storage
          .from('participantes')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error subiendo comprobante:', error);
              throw error;
            }
            console.log('Comprobante subido:', data.path);
            comprobante_url = data.path;
          })
      );
    }

    // Subir foto anverso CI
    if (files.foto_anverso && files.foto_anverso[0]) {
      const file = files.foto_anverso[0];
      const fileExt = file.originalname.split('.').pop();
      const fileName = `ci_fotos/${ci.toUpperCase()}_anverso_${Date.now()}.${fileExt}`;

      uploadPromises.push(
        supabase.storage
          .from('participantes')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error subiendo foto anverso:', error);
              throw error;
            }
            console.log('Foto anverso subida:', data.path);
            foto_anverso_url = data.path;
          })
      );
    }

    // Subir foto reverso CI
    if (files.foto_reverso && files.foto_reverso[0]) {
      const file = files.foto_reverso[0];
      const fileExt = file.originalname.split('.').pop();
      const fileName = `ci_fotos/${ci.toUpperCase()}_reverso_${Date.now()}.${fileExt}`;

      uploadPromises.push(
        supabase.storage
          .from('participantes')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error subiendo foto reverso:', error);
              throw error;
            }
            console.log('Foto reverso subida:', data.path);
            foto_reverso_url = data.path;
          })
      );
    }

    // Subir autorización (si existe)
    if (files.autorizacion && files.autorizacion[0]) {
      const file = files.autorizacion[0];
      const fileExt = file.originalname.split('.').pop();
      const fileName = `autorizaciones/${ci.toUpperCase()}_autorizacion_${Date.now()}.${fileExt}`;

      uploadPromises.push(
        supabase.storage
          .from('participantes')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error subiendo autorización:', error);
              throw error;
            }
            console.log('Autorización subida:', data.path);
            autorizacion_url = data.path;
          })
      );
    }

    // Esperar a que se suban todos los archivos
    try {
      console.log('Esperando subida de archivos...');
      await Promise.all(uploadPromises);
      console.log('Todos los archivos subidos exitosamente');
    } catch (uploadError) {
      console.error('Error en subida de archivos:', uploadError);
      return res.status(500).json({ error: 'Error subiendo archivos: ' + uploadError.message });
    }

    // Crear participante - TODO EN MAYÚSCULAS
    console.log('Creando participante en base de datos...');
    const nuevoParticipante = {
      nombre: nombre.toUpperCase(),
      apellidos: apellidos.toUpperCase(),
      ci: ci.toUpperCase(),
      fecha_nacimiento,
      dorsal: dorsal, // Mantener como string para preservar ceros iniciales
      categoria_id,
      equipo: equipo ? equipo.toUpperCase() : null,
      metodo_pago: metodo_pago.toUpperCase(),
      comprobante_url,
      comunidad: comunidad.toUpperCase(),
      foto_anverso_url,
      foto_reverso_url,
      autorizacion_url
    };

    console.log('Datos del participante (admin):', nuevoParticipante);

    const { data, error } = await supabase
      .from('participantes')
      .insert(nuevoParticipante)
      .select(`
        *,
        categorias(nombre)
      `);

    if (error) {
      console.error('Error insertando participante:', error);
      return res.status(500).json({ error: 'Error registrando participante: ' + error.message });
    }

    console.log('Participante creado exitosamente (admin):', data[0]);

    res.status(201).json({ 
      message: `Participante registrado con éxito con dorsal ${dorsal}.`,
      participante: data[0]
    });

  } catch (err) {
    console.error('Error general creando participante admin:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ 
      error: 'Error interno del servidor: ' + err.message 
    });
  }
};

// Verificar disponibilidad de dorsal
exports.checkDorsal = async (req, res) => {
  try {
    const { dorsal } = req.params;

    if (!dorsal) {
      return res.status(400).json({ error: 'Dorsal es requerido' });
    }

    const { data, error } = await supabase
      .from('participantes')
      .select('dorsal')
      .eq('dorsal', dorsal); // Comparar como string

    if (error) {
      return res.status(500).json({ error: 'Error verificando dorsal' });
    }

    const existe = data && data.length > 0;

    res.json({ 
      existe,
      disponible: !existe,
      message: existe ? 'Este dorsal ya está en uso' : 'Dorsal disponible'
    });
  } catch (err) {
    console.error('Error verificando dorsal:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener URL pública de archivo
exports.getArchivoUrl = async (req, res) => {
  try {
    const { path } = req.params;

    if (!path) {
      return res.status(400).json({ error: 'Path del archivo es requerido' });
    }

    // Obtener URL pública del archivo
    const { data } = await supabase.storage
      .from('participantes')
      .getPublicUrl(path);

    if (!data || !data.publicUrl) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.json({ url: data.publicUrl });
  } catch (err) {
    console.error('Error obteniendo URL del archivo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener todos los participantes
exports.getParticipantes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('participantes')
      .select(`
        id,
        nombre,
        apellidos,
        ci,
        dorsal,
        categoria_id,
        comprobante_url,
        metodo_pago,
        created_at,
        comunidad,
        foto_anverso_url,
        foto_reverso_url,
        equipo,
        fecha_nacimiento,
        autorizacion_url,
        categorias(nombre, hora_salida)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // DEBUG: Verificar si el campo viene desde Supabase
    console.log('=== DEBUG BACKEND ===');
    console.log('Primer participante desde Supabase:', JSON.stringify(data[0], null, 2));
    console.log('autorizacion_url del primer participante:', data[0]?.autorizacion_url);

    res.json({ participantes: data });
  } catch (err) {
    console.error('Error obteniendo participantes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};