FROM node:22-alpine

WORKDIR /app

COPY . .

RUN npm ci \
  && npm run build --workspace @arch-draw/domain \
  && npm run build --workspace @arch-draw/api

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3333
ENV DATABASE_PATH=/app/data/arch-draw.sqlite
ENV WEB_ORIGINS=http://localhost:8080,http://127.0.0.1:8080

EXPOSE 3333

CMD ["npm", "run", "start", "--workspace", "@arch-draw/api"]
