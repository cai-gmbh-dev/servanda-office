# Servanda Office — Frontend (Static Build)
# Multi-stage: build with Node, serve with Nginx

FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=@servanda/web --workspace=@servanda/shared

COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

RUN npm run build -w packages/shared
RUN npm run build -w apps/web

# --- Production ---
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
