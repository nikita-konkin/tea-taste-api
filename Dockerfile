FROM node:18-alpine
WORKDIR /app

# Install dependencies first to leverage layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the application code.
# Note: .env is NOT copied into the image — provide configuration via
# docker-compose env_file / environment (or a mounted .env volume).
COPY . ./

EXPOSE 3001
CMD ["node", "app.js"]
