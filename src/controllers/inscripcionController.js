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

// Actualizar participante
exports.updateParticipante = async (req, res) => {
  try {
    const { id } = req.params;
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

    // Validar campos requeridos
    if (!nombre || !apellidos || !ci || !fecha_nacimiento || !dorsal || !categoria_id || !metodo_pago) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Verificar si el CI o dorsal ya existe en otro participante
    const { data: existingParticipant, error: checkError } = await supabase
      .from('participantes')
      .select('id, ci, dorsal')
      .or(`ci.eq.${ci},dorsal.eq.${dorsal}`)
      .neq('id', id);

    if (checkError) {
      return res.status(500).json({ error: 'Error verificando participante existente' });
    }

    if (existingParticipant && existingParticipant.length > 0) {
      const existing = existingParticipant[0];
      if (existing.ci === ci) {
        return res.status(400).json({ error: 'Ya existe otro participante con este CI' });
      }
      if (existing.dorsal === dorsal) {
        return res.status(400).json({ error: 'Ya existe otro participante con este dorsal' });
      }
    }

    const participanteActualizado = {
      nombre,
      apellidos,
      ci,
      fecha_nacimiento,
      dorsal,
      categoria_id,
      equipo: equipo || null,
      metodo_pago,
      comprobante_url: comprobante_url || null,
      comunidad: comunidad || null,
      foto_anverso_url: foto_anverso_url || null,
      foto_reverso_url: foto_reverso_url || null,
      autorizacion_url: autorizacion_url || null
    };

    const { data, error } = await supabase
      .from('participantes')
      .update(participanteActualizado)
      .eq('id', id)
      .select(`
        *,
        categorias(nombre)
      `);

    if (error) {
      console.error('Error actualizando participante:', error);
      return res.status(500).json({ error: 'Error actualizando participante' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Participante no encontrado' });
    }

    res.json({ 
      message: 'Participante actualizado con éxito',
      participante: data[0]
    });
  } catch (err) {
    console.error('Error actualizando participante:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
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

    // Validar año minimo
    if (birthDate.getFullYear() < 2011) {
      console.log('Error: Año superior a 2011');
      return res.status(400).json({ error: 'Solo se admiten participantes nacidos desde el año 2011 en adelante' });
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
      .eq('ci', ci);

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
      const fileName = `comprobantes/${ci}_comprobante_${Date.now()}.${fileExt}`;

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
      const fileName = `ci_fotos/${ci}_anverso_${Date.now()}.${fileExt}`;

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
      const fileName = `ci_fotos/${ci}_reverso_${Date.now()}.${fileExt}`;

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
      const fileName = `autorizaciones/${ci}_autorizacion_${Date.now()}.${fileExt}`;

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

    // Crear participante
    console.log('Creando participante en base de datos...');
    const nuevoParticipante = {
      nombre,
      apellidos,
      ci,
      fecha_nacimiento,
      dorsal: req.body.dorsal || null,
      categoria_id,
      equipo: equipo || null,
      metodo_pago,
      comprobante_url,
      comunidad,
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
            fileName = `comprobantes/${ci}_${fieldName}_${Date.now()}.${fileExt}`;
            break;
          case 'foto_anverso':
          case 'foto_reverso':
            fileName = `ci_fotos/${ci}_${fieldName}_${Date.now()}.${fileExt}`;
            break;
          case 'autorizacion':
            fileName = `autorizaciones/${ci}_${fieldName}_${Date.now()}.${fileExt}`;
            break;
          default:
            fileName = `${fieldName}/${ci}_${fieldName}_${Date.now()}.${fileExt}`;
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
exports.createParticipante = async (req, res) => {
  try {
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

    // Validar campos requeridos
    if (!nombre || !apellidos || !ci || !fecha_nacimiento || !dorsal || !categoria_id || !metodo_pago) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Verificar si el CI o dorsal ya existe
    const { data: existingParticipant, error: checkError } = await supabase
      .from('participantes')
      .select('ci, dorsal')
      .or(`ci.eq.${ci},dorsal.eq.${dorsal}`);

    if (checkError) {
      return res.status(500).json({ error: 'Error verificando participante existente' });
    }

    if (existingParticipant && existingParticipant.length > 0) {
      const existing = existingParticipant[0];
      if (existing.ci === ci) {
        return res.status(400).json({ error: 'Ya existe un participante con este CI' });
      }
      if (existing.dorsal === dorsal) {
        return res.status(400).json({ error: 'Ya existe un participante con este dorsal' });
      }
    }

    const nuevoParticipante = {
      nombre,
      apellidos,
      ci,
      fecha_nacimiento,
      dorsal,
      categoria_id,
      equipo: equipo || null,
      metodo_pago,
      comprobante_url: comprobante_url || null,
      comunidad: comunidad || null,
      foto_anverso_url: foto_anverso_url || null,
      foto_reverso_url: foto_reverso_url || null,
      autorizacion_url: autorizacion_url || null
    };

    const { data, error } = await supabase
      .from('participantes')
      .insert(nuevoParticipante)
      .select();

    if (error) {
      console.error('Error insertando participante:', error);
      return res.status(500).json({ error: 'Error registrando participante' });
    }

    res.status(201).json({ 
      message: 'Participante registrado con éxito',
      participante: data[0]
    });
  } catch (err) {
    console.error('Error creando participante:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
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
      .eq('dorsal', dorsal);

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
        *,
        categorias(nombre, hora_salida)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ participantes: data });
  } catch (err) {
    console.error('Error obteniendo participantes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};