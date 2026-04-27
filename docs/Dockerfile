# Stage 1 — build the Docusaurus static bundle
FROM node:20.19-alpine3.21 AS builder

WORKDIR /app

# Copy dependency manifests first for layer-cache efficiency
COPY package.json package-lock.json* ./

RUN npm ci

# Copy the rest of the source and build. WORKSHOP_REF pins the git ref that
# `{{REF}}` placeholders in MDX code blocks resolve to (see
# `src/remark/replace-ref.js`). The CI workflow passes the tag name on a
# `vX.Y.Z` build; defaults to `main` for branch builds and local docker build.
COPY . .
ARG WORKSHOP_REF=main
ENV WORKSHOP_REF=${WORKSHOP_REF}
RUN npm run build

# Stage 2 — serve via nginx
FROM nginx:1.27-alpine3.21

# Drop the default nginx config and replace with our own
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static site from the builder stage
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
