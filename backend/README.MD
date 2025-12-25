goose migrations

goose -dir migrations create <migration> sql
goose -dir migrations postgres "postgres://<user>:<password>@<host>:<port>/<database>?sslmode=disable" up
