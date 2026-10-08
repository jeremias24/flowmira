# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty = call the API on the same origin (/api), which nginx proxies to the backend
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
# ── NEW ── Build-time paths for Traefik subpath hosting.
ARG VITE_ERD_API_URL=""
ENV VITE_ERD_API_URL=$VITE_ERD_API_URL
ARG VITE_BASE_PATH="/"
RUN npm run build -- --base "$VITE_BASE_PATH"

# ---- serve stage ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
