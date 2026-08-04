# Builds the two static frontends and packages them with Nginx.
# Build context MUST be the repo root (docker-compose.prod.yml sets this),
# since this stage copies from sibling frontend/ and frontend-admin/ dirs.

FROM node:20-slim AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable && corepack prepare yarn@1.22.22 --activate && yarn install --frozen-lockfile
COPY frontend/ .
# REACT_APP_BACKEND_URL is deliberately NOT set: the app falls back to a
# same-origin '/api' base, which app.conf proxies to the backend. Setting it to
# an absolute URL here would hard-code the public hostname into the bundle.
#
# The Sentry DSN, by contrast, HAS to be a build arg. Create React App inlines REACT_APP_*
# variables into the bundle at build time, so it cannot be read from the container's environment
# at runtime like every backend setting is. Supplied by the compose files from the stack's .env;
# absent, the frontend simply reports nothing. A DSN is not a secret — it is a write-only
# ingestion endpoint and is visible in the shipped bundle by design.
ARG REACT_APP_SENTRY_DSN=""
ENV REACT_APP_SENTRY_DSN=$REACT_APP_SENTRY_DSN
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
COPY deploy/nginx/app.conf /etc/nginx/conf.d/app.conf
# Header/CSP fragments included BY app.conf. They must land outside conf.d — the stock nginx.conf
# auto-includes conf.d/*.conf at http level, which would apply these add_headers globally (to the
# /api proxy responses too) instead of only in the static locations that include them.
COPY deploy/nginx/snippets/ /etc/nginx/snippets/
COPY --from=frontend-build /app/build /usr/share/nginx/html
COPY --from=admin-build /app/dist /usr/share/nginx/html/admin
