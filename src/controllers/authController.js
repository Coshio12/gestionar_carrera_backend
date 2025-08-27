const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Registro sincronizado: Supabase Auth + tabla usuarios
exports.register = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    // 1. Registrar en Supabase Auth
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });

    // 2. Guardar en la tabla usuarios (solo name, email, password)
    const { error: dbError } = await supabase.from('usuarios').insert([
      { name, email, password }
    ]);
    if (dbError) return res.status(400).json({ error: dbError.message });

    res.json({ user: data.user, message: 'Usuario registrado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor al registrar usuario' });
  }
};

// Login usando JWT tokens
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    // 1. Autenticar con Supabase
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: error.message });
    }

    // 2. Obtener datos del usuario desde la tabla usuarios
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('name, email')
      .eq('email', email)
      .single();

    if (userError) {
      return res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }

    // 3. Crear JWT token
    const token = jwt.sign(
      { email: userData.email, name: userData.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      user: userData,
      message: 'Login exitoso'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor al intentar iniciar sesión' });
  }
};

// Middleware para verificar token
exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// Endpoint para obtener información del usuario actual
exports.me = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('name, email')
      .eq('email', req.user.email)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }

    res.json({ user: data });
  } catch (error) {
    console.error('Error en /me:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};