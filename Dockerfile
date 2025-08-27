# Imagen base de Node.js
FROM node:18

# Crear directorio de la app
WORKDIR /usr/src/app

# Copiar dependencias
COPY package*.json ./
RUN npm install --production

# Copiar el resto del código
COPY . .

# Exponer el puerto
EXPOSE 5000

# Comando para arrancar
CMD ["npm", "start"]
