-- +goose Up
-- +goose StatementBegin
CREATE TABLE artists (
    id BIGSERIAL PRIMARY KEY,
    artist_id VARCHAR(22) NOT NULL
);

CREATE TABLE scrapes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE scrape_artists (
    scrape_id BIGINT NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
    artist_id BIGINT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    PRIMARY KEY (scrape_id, artist_id)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS scrape_artists;
DROP TABLE IF EXISTS scrapes;
DROP TABLE IF EXISTS artists;
DROP TABLE IF EXISTS users;
-- +goose StatementEnd
