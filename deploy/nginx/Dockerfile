# Builds the two static frontends and packages them with Nginx.
# Build context MUST be the repo root (docker-compose.prod.yml sets this),
# since this stage copies from sibling frontend/ and frontend-admin/ dirs.

FROM node:20-slim AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable && corepack prepare yarn@1.22.22 --activate && yarn install --frozen-lockfile
COPY frontend/ .
RUN yarn build

FROM node:20-slim AS admin-build
WORKDIR /app
COPY frontend-admin/package.json frontend-admin/package-lock.json ./
RUN npm ci
COPY frontend-admin/ .
ENV VITE_BASE_PATH=/admin/
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
# Active server config is bind-mounted at runtime (deploy/nginx/conf.d/) so
# init-letsencrypt.sh can swap HTTP-only <-> HTTPS without rebuilding this image.
COPY --from=frontend-build /app/build /usr/share/nginx/html
COPY --from=admin-build /app/dist /usr/share/nginx/html/admin
