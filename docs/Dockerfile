# Stage 1 — build the Docusaurus static bundle
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer-cache efficiency
COPY package.json package-lock.json* ./

RUN npm ci

# Copy the rest of the source and build
COPY . .
RUN npm run build

# Stage 2 — serve via nginx
FROM nginx:alpine

# Drop the default nginx config and replace with our own
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static site from the builder stage
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
