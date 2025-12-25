-- name: CreateUser :one
INSERT INTO users (id)
VALUES ($1)
RETURNING *;

-- name: CreateScrape :one
INSERT INTO scrapes (user_id)
VALUES ($1)
RETURNING id;

-- name: CreateArtist :one
INSERT INTO artists (artist_id)
VALUES ($1)
ON CONFLICT (artist_id) DO UPDATE SET artist_id = EXCLUDED.artist_id
RETURNING id;

-- name: CreateScrapeArtist :exec
INSERT INTO scrape_artists (scrape_id, artist_id)
VALUES ($1, $2);

-- name: GetScrapeArtists :many
SELECT a.id, a.artist_id
FROM artists a
JOIN scrape_artists sa ON sa.artist_id = a.id
WHERE sa.scrape_id = $1;

-- name: DeleteScrape :exec
DELETE FROM scrapes
WHERE id = $1;

-- name: GetUserArtists :many
SELECT DISTINCT 
    a.artist_id
FROM artists a
JOIN scrape_artists sa ON sa.artist_id = a.id
JOIN scrapes s ON s.id = sa.scrape_id
WHERE s.user_id = $1
ORDER BY a.artist_id;

-- name: GetUserByID :one
SELECT EXISTS (
    SELECT 1 
    FROM users 
    WHERE id = $1
);

-- name: GetScrapeByID :one
SELECT EXISTS (
    SELECT 1 
    FROM scrapes 
    WHERE id = $1
);

-- name: GetUserScrapes :one
SELECT DISTINCT a.artist_id
FROM artists a
JOIN scrape_artists sa ON sa.artist_id = a.id
JOIN scrapes s ON s.id = sa.scrape_id
WHERE s.user_id = $1 AND s.id = $2
ORDER BY a.artist_id;

-- name: GetArtistsByUserAndScrapeID :many
SELECT a.artist_id
FROM artists a
JOIN scrape_artists sa ON sa.artist_id = a.id
JOIN scrapes s ON s.id = sa.scrape_id
WHERE s.user_id = $1
AND s.id = $2;