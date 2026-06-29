FROM node:22-alpine

WORKDIR /app

COPY . .

RUN npm ci \
  && npm run build --workspace @arch-draw/domain \
  && npm run build --workspace @arch-draw/api

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3333
ENV ARCH_DRAW_STORAGE_PATH=/app/data/arch-draw.store
ENV WEB_ORIGINS=http://localhost:8080,http://127.0.0.1:8080

EXPOSE 3333

RUN mkdir -p /app/data \
  && chown -R node:node /app/data /app

USER node

# Run node directly (not via npm): the container uses a read-only root filesystem,
# and npm would need a writable HOME for its cache/logs. Executing the built entry
# point avoids that and reduces the runtime surface.
CMD ["node", "apps/api/dist/main.js"]
