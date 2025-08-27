const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Obtener todas las etapas con información de categorías (relación N:M)
exports.getEtapas = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('etapas')
            .select(`
                *,
                etapa_categorias!inner (
                    categorias (
                        id,
                        nombre
                    )
                )
            `)
            .order('numero_etapa', { ascending: true });
        
        if (error) {
            console.error('Error Supabase:', error);
            return res.status(500).json({ error: 'Error al obtener las etapas' });
        }
        
        // Transformar los datos para tener un array de categorías por etapa
        const etapasWithCategorias = data.map(etapa => ({
            ...etapa,
            categorias: etapa.etapa_categorias.map(ec => ec.categorias),
            categorias_ids: etapa.etapa_categorias.map(ec => ec.categorias.id)
        }));
        
        return res.status(200).json(etapasWithCategorias);
    } catch (error) {
        console.error('Error al obtener las etapas:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener una etapa por ID
exports.getEtapaById = async (req, res) => {
    const { id } = req.params;
    
    try {
        const { data, error } = await supabase
            .from('etapas')
            .select(`
                *,
                etapa_categorias!inner (
                    categorias (
                        id,
                        nombre
                    )
                )
            `)
            .eq('id', id)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Etapa no encontrada' });
            }
            console.error('Error Supabase:', error);
            return res.status(500).json({ error: 'Error al obtener la etapa' });
        }
        
        // Transformar los datos
        const etapaWithCategorias = {
            ...data,
            categorias: data.etapa_categorias.map(ec => ec.categorias),
            categorias_ids: data.etapa_categorias.map(ec => ec.categorias.id)
        };
        
        return res.status(200).json(etapaWithCategorias);
    } catch (error) {
        console.error('Error al obtener la etapa:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Crear nueva etapa
exports.createEtapa = async (req, res) => {
    const { numero_etapa, nombre, descripcion, categorias_ids, distancia_km, activa } = req.body;
    
    // Validaciones
    if (!numero_etapa || !nombre || !categorias_ids || categorias_ids.length === 0) {
        return res.status(400).json({ 
            error: 'Número de etapa, nombre y al menos una categoría son requeridos' 
        });
    }
    
    try {
        // Crear la etapa (sin categoria_id)
        const { data: etapa, error: etapaError } = await supabase
            .from('etapas')
            .insert([{ 
                numero_etapa: parseInt(numero_etapa),
                nombre: nombre.trim().toUpperCase(),
                descripcion: descripcion ? descripcion.trim() : null,
                distancia_km: distancia_km ? parseFloat(distancia_km) : null,
                activa: activa !== undefined ? activa : true
            }])
            .select()
            .single();

        if (etapaError) throw etapaError;

        // Insertar relaciones con categorías
        const relacionesCategorias = categorias_ids.map(categoria_id => ({
            etapa_id: etapa.id,
            categoria_id: categoria_id
        }));

        const { error: relacionesError } = await supabase
            .from('etapa_categorias')
            .insert(relacionesCategorias);

        if (relacionesError) throw relacionesError;

        // Obtener la etapa completa con categorías
        const { data: etapaCompleta } = await supabase
            .from('etapas')
            .select(`
                *,
                etapa_categorias!inner (
                    categorias (
                        id,
                        nombre
                    )
                )
            `)
            .eq('id', etapa.id)
            .single();

        const etapaResponse = {
            ...etapaCompleta,
            categorias: etapaCompleta.etapa_categorias.map(ec => ec.categorias),
            categorias_ids: etapaCompleta.etapa_categorias.map(ec => ec.categorias.id)
        };

        res.status(201).json({ 
            message: 'Etapa creada con éxito',
            etapa: etapaResponse
        });
    } catch (error) {
        console.error('Error al crear la etapa:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Actualizar etapa
exports.updateEtapa = async (req, res) => {
    const { id } = req.params;
    const { numero_etapa, nombre, descripcion, categorias_ids, distancia_km, activa } = req.body;
    
    // Validaciones
    if (!numero_etapa || !nombre || !categorias_ids || categorias_ids.length === 0) {
        return res.status(400).json({ 
            error: 'Número de etapa, nombre y al menos una categoría son requeridos' 
        });
    }
    
    if (nombre.trim().length === 0) {
        return res.status(400).json({ error: 'El nombre no puede estar vacío' });
    }
    
    if (numero_etapa <= 0) {
        return res.status(400).json({ error: 'El número de etapa debe ser mayor a 0' });
    }
    
    if (distancia_km && distancia_km <= 0) {
        return res.status(400).json({ error: 'La distancia debe ser mayor a 0' });
    }
    
    try {
        // Verificar si la etapa existe
        const { data: existingEtapa, error: checkError } = await supabase
            .from('etapas')
            .select('id')
            .eq('id', id)
            .single();
        
        if (checkError && checkError.code === 'PGRST116') {
            return res.status(404).json({ error: 'Etapa no encontrada' });
        }
        
        // Verificar si las categorías existen
        for (const categoria_id of categorias_ids) {
            const { data: categoria, error: categoriaError } = await supabase
                .from('categorias')
                .select('id')
                .eq('id', categoria_id)
                .single();
            
            if (categoriaError && categoriaError.code === 'PGRST116') {
                return res.status(404).json({ error: `Categoría con ID ${categoria_id} no encontrada` });
            }
        }
        
        // Actualizar la etapa (sin categoria_id)
        const { data: etapaActualizada, error: updateError } = await supabase
            .from('etapas')
            .update({ 
                numero_etapa: parseInt(numero_etapa),
                nombre: nombre.trim().toUpperCase(),
                descripcion: descripcion ? descripcion.trim() : null,
                distancia_km: distancia_km ? parseFloat(distancia_km) : null,
                activa: activa !== undefined ? activa : true
            })
            .eq('id', id)
            .select()
            .single();
        
        if (updateError) {
            console.error('Error Supabase:', updateError);
            return res.status(500).json({ error: 'Error al actualizar la etapa' });
        }

        // Eliminar relaciones existentes
        const { error: deleteRelacionesError } = await supabase
            .from('etapa_categorias')
            .delete()
            .eq('etapa_id', id);

        if (deleteRelacionesError) {
            console.error('Error eliminando relaciones:', deleteRelacionesError);
            return res.status(500).json({ error: 'Error al actualizar relaciones con categorías' });
        }

        // Insertar nuevas relaciones
        const nuevasRelaciones = categorias_ids.map(categoria_id => ({
            etapa_id: parseInt(id),
            categoria_id: categoria_id
        }));

        const { error: insertRelacionesError } = await supabase
            .from('etapa_categorias')
            .insert(nuevasRelaciones);

        if (insertRelacionesError) {
            console.error('Error insertando relaciones:', insertRelacionesError);
            return res.status(500).json({ error: 'Error al actualizar relaciones con categorías' });
        }

        // Obtener la etapa completa con categorías
        const { data: etapaCompleta } = await supabase
            .from('etapas')
            .select(`
                *,
                etapa_categorias!inner (
                    categorias (
                        id,
                        nombre
                    )
                )
            `)
            .eq('id', id)
            .single();

        const etapaResponse = {
            ...etapaCompleta,
            categorias: etapaCompleta.etapa_categorias.map(ec => ec.categorias),
            categorias_ids: etapaCompleta.etapa_categorias.map(ec => ec.categorias.id)
        };

        res.status(200).json({ 
            message: 'Etapa actualizada con éxito',
            etapa: etapaResponse
        });
    } catch (error) {
        console.error('Error al actualizar la etapa:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Eliminar etapa
exports.deleteEtapa = async (req, res) => {
    const { id } = req.params;
    
    try {
        // Verificar si la etapa existe
        const { data: existingEtapa, error: checkError } = await supabase
            .from('etapas')
            .select('id, nombre, numero_etapa')
            .eq('id', id)
            .single();
        
        if (checkError && checkError.code === 'PGRST116') {
            return res.status(404).json({ error: 'Etapa no encontrada' });
        }
        
        // Eliminar relaciones primero (debido a foreign keys)
        const { error: deleteRelacionesError } = await supabase
            .from('etapa_categorias')
            .delete()
            .eq('etapa_id', id);

        if (deleteRelacionesError) {
            console.error('Error eliminando relaciones:', deleteRelacionesError);
            return res.status(500).json({ error: 'Error al eliminar relaciones con categorías' });
        }
        
        // Eliminar la etapa
        const { error } = await supabase
            .from('etapas')
            .delete()
            .eq('id', id);
        
        if (error) {
            console.error('Error Supabase:', error);
            return res.status(500).json({ error: 'Error al eliminar la etapa' });
        }

        res.status(200).json({ 
            message: 'Etapa eliminada con éxito',
            etapa: existingEtapa
        });
    } catch (error) {
        console.error('Error al eliminar la etapa:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};