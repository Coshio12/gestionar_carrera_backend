require('dotenv').config(); 
const app = require('./app');

const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en puerto ${PORT}`);
  console.log(`URL completa: http://localhost:${PORT}`);
});

