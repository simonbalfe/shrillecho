CREATE TABLE artists (
    id BIGSERIAL PRIMARY KEY,
    artist_id VARCHAR(22) NOT NULL UNIQUE
);

CREATE TABLE users (
    id UUID PRIMARY KEY
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