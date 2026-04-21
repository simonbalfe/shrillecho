import { relations } from 'drizzle-orm'
import { bigserial, boolean, index, integer, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// Better Auth tables
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

// Shrillecho domain tables
export const artist = pgTable('artist', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  artistId: varchar('artist_id', { length: 22 }).notNull().unique(),
  name: text('name'),
  imageUrl: text('image_url'),
})

export const scrape = pgTable(
  'scrape',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').default('pending').notNull(),
    seedArtist: text('seed_artist'),
    depth: bigserial('depth', { mode: 'number' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('scrape_userId_idx').on(table.userId)],
)

export const spotifyTrack = pgTable('spotify_track', {
  trackId: varchar('track_id', { length: 22 }).primaryKey(),
  name: text('name').notNull(),
  durationMs: integer('duration_ms'),
  discNumber: integer('disc_number'),
  trackNumber: integer('track_number'),
  explicit: boolean('explicit').default(false).notNull(),
  albumId: varchar('album_id', { length: 22 }),
  albumName: text('album_name'),
  albumImageUrl: text('album_image_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const spotifyTrackArtist = pgTable(
  'spotify_track_artist',
  {
    trackId: varchar('track_id', { length: 22 })
      .notNull()
      .references(() => spotifyTrack.trackId, { onDelete: 'cascade' }),
    artistId: varchar('artist_id', { length: 22 }).notNull(),
    artistName: text('artist_name'),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.artistId] }), index('spotify_track_artist_artist_idx').on(t.artistId)],
)

export const likedTrack = pgTable(
  'liked_track',
  {
    trackId: varchar('track_id', { length: 22 })
      .primaryKey()
      .references(() => spotifyTrack.trackId, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }),
    playable: boolean('playable'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('liked_track_added_at_idx').on(t.addedAt)],
)

export const scrapeArtist = pgTable(
  'scrape_artist',
  {
    scrapeId: bigserial('scrape_id', { mode: 'number' })
      .notNull()
      .references(() => scrape.id, { onDelete: 'cascade' }),
    artistId: bigserial('artist_id', { mode: 'number' })
      .notNull()
      .references(() => artist.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.scrapeId, table.artistId] })],
)

// Relations
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  scrapes: many(scrape),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const scrapeRelations = relations(scrape, ({ one, many }) => ({
  user: one(user, { fields: [scrape.userId], references: [user.id] }),
  artists: many(scrapeArtist),
}))

export const scrapeArtistRelations = relations(scrapeArtist, ({ one }) => ({
  scrape: one(scrape, { fields: [scrapeArtist.scrapeId], references: [scrape.id] }),
  artist: one(artist, { fields: [scrapeArtist.artistId], references: [artist.id] }),
}))

export const spotifyTrackRelations = relations(spotifyTrack, ({ many, one }) => ({
  artists: many(spotifyTrackArtist),
  liked: one(likedTrack, { fields: [spotifyTrack.trackId], references: [likedTrack.trackId] }),
}))

export const spotifyTrackArtistRelations = relations(spotifyTrackArtist, ({ one }) => ({
  track: one(spotifyTrack, { fields: [spotifyTrackArtist.trackId], references: [spotifyTrack.trackId] }),
}))

export const likedTrackRelations = relations(likedTrack, ({ one }) => ({
  track: one(spotifyTrack, { fields: [likedTrack.trackId], references: [spotifyTrack.trackId] }),
}))

export const schema = {
  user,
  session,
  account,
  verification,
  artist,
  scrape,
  scrapeArtist,
  spotifyTrack,
  spotifyTrackArtist,
  likedTrack,
}
