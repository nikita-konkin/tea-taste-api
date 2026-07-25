FROM node:18-alpine
WORKDIR /app

# Voice notes: ffmpeg transcodes each recording to the mono mp3 that SpeechKit
# accepts (its container list is WAV | OGG_OPUS | MP3 — never the webm/opus or
# mp4/aac a browser records), concatenates the per-пролив segments into one
# track, and ffprobe measures it so the 5-minute cap is checked server-side.
RUN apk add --no-cache ffmpeg

# Install dependencies first to leverage layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the application code.
# Note: .env is NOT copied into the image — provide configuration via
# docker-compose env_file / environment (or a mounted .env volume).
COPY . ./

EXPOSE 3001
CMD ["node", "app.js"]
