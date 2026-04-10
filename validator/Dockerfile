# Stage 1 — compile the Go binary
FROM golang:1.22-alpine AS builder

WORKDIR /src

# Copy dependency manifests for layer-cache efficiency
COPY go.mod go.sum* ./
RUN go mod download

# Copy source and build a fully static binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /validator .

# Stage 2 — minimal runtime image (no shell, no libc)
FROM gcr.io/distroless/static:nonroot

COPY --from=builder /validator /validator

USER nonroot:nonroot
EXPOSE 8081
ENTRYPOINT ["/validator"]
