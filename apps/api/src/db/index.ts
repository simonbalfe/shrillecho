import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config'
import * as schema from './schema'

if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required')

const client = postgres(config.DATABASE_URL)
export const db = drizzle(client, { schema })
