FROM golang:1.23-alpine AS builder
WORKDIR /app
RUN apk add --no-cache gcc musl-dev
COPY . ./
RUN go mod tidy
RUN go get -u gitlab.com/smwbalfe/spotify-client@latest
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/main.go

FROM alpine:latest

WORKDIR /app
COPY --from=builder /app/main .
COPY --from=builder /app/migrations ./migrations
EXPOSE 8080
CMD ["./main"]