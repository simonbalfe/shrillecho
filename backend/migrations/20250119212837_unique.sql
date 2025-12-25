-- +goose Up
-- +goose StatementBegin
ALTER TABLE artists ADD CONSTRAINT artists_artist_id_key UNIQUE (artist_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE artists DROP CONSTRAINT artists_artist_id_key;
-- +goose StatementEnd
