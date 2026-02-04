# FORGE Application Dockerfile
# Multi-stage build for minimal production image

# Stage 1: Build the forge CLI
FROM golang:1.22-alpine AS builder

WORKDIR /build

# Copy go modules first for caching
COPY runtime/go.mod runtime/go.sum ./runtime/
COPY compiler/go.mod compiler/go.sum ./compiler/
RUN cd runtime && go mod download
RUN cd compiler && go mod download

# Copy source and build
COPY runtime/ ./runtime/
COPY compiler/ ./compiler/
RUN cd runtime && CGO_ENABLED=0 GOOS=linux go build -o /forge ./cmd/forge

# Stage 2: Build the frontend (if web/ exists in project)
FROM node:20-alpine AS frontend

WORKDIR /app
ARG PROJECT_DIR=.

# Copy package files
COPY ${PROJECT_DIR}/web/package*.json ./
RUN npm ci

# Copy source and build
COPY ${PROJECT_DIR}/web/ ./
RUN npm run build

# Stage 3: Production image
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy forge binary
COPY --from=builder /forge /usr/local/bin/forge

# Copy app artifacts (these should be built before docker build)
ARG PROJECT_DIR=.
COPY ${PROJECT_DIR}/.forge-runtime/ ./.forge-runtime/
COPY ${PROJECT_DIR}/forge.runtime.toml ./

# Copy frontend build
COPY --from=frontend /app/dist ./web/dist/

# Create non-root user
RUN adduser -D -u 1000 forge
USER forge

# Runtime configuration
ENV FORGE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["forge", "run"]
