package config

import (
	"os"
	"strings"
)

type PostgresConfig struct {
	PostgresHost     string
	PostgresPassword string
	PostgresDb       string
	PostgresUser     string
	PostgresPort     string
}

type RedisConfig struct {
	RedisHost string
	RedisPort string
}

type ServerConfig struct {
	ServerHost string
	ServerPort string
}

type Environment struct {
	PostgresConfig
	RedisConfig
	ServerConfig
	AllowedOrigins    []string
	SupabaseJwtSecret string
}

func LoadEnv() Environment {
	postgresHost := os.Getenv("POSTGRES_HOST")
	postgresPassword := os.Getenv("POSTGRES_PASSWORD")
	postgresDb := os.Getenv("POSTGRES_DB")
	postgresUser := os.Getenv("POSTGRES_USER")
	postgresPort := os.Getenv("POSTGRES_PORT")

	redisHost := os.Getenv("REDIS_HOST")
	redisPort := os.Getenv("REDIS_PORT")

	serverHost := os.Getenv("GO_HOST")
	serverPort := os.Getenv("GO_PORT")

	supabaseJwtSecret := os.Getenv("SUPABASE_JWT_SECRET")
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")

	if postgresHost == "" || postgresPassword == "" || postgresDb == "" || postgresUser == "" {

		panic("Missing required PostgreSQL environment variables")
	}
	if redisHost == "" || redisPort == "" {
		panic("Missing required Redis environment variables")
	}
	if serverHost == "" || serverPort == "" {
		panic("Missing required server environment variables")
	}
	if supabaseJwtSecret == "" {
		panic("Missing required Supabase JWT secret")
	}

	var origins []string
	if allowedOrigins != "" {
		origins = strings.Split(allowedOrigins, ",")
	}

	return Environment{
		PostgresConfig: PostgresConfig{
			PostgresHost:     postgresHost,
			PostgresPassword: postgresPassword,
			PostgresDb:       postgresDb,
			PostgresUser:     postgresUser,
			PostgresPort:     postgresPort,
		},
		RedisConfig: RedisConfig{
			RedisHost: redisHost,
			RedisPort: redisPort,
		},
		ServerConfig: ServerConfig{
			ServerHost: serverHost,
			ServerPort: serverPort,
		},
		SupabaseJwtSecret: supabaseJwtSecret,
		AllowedOrigins:    origins,
	}
}
