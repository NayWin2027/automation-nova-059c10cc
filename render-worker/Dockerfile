# Cloud Run worker — Node 20 + ffmpeg
FROM node:20-slim

# Install ffmpeg + fonts (for subtitle burning)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      fonts-noto \
      fonts-noto-cjk \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]