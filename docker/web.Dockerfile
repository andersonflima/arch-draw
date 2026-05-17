FROM node:22-alpine AS build

WORKDIR /app

COPY . .

RUN npm ci \
  && npm run build --workspace @arch-draw/domain \
  && npm run build --workspace @arch-draw/web

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/browser /usr/share/nginx/html

EXPOSE 8080
