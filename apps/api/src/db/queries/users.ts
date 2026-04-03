import { eq } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema'

export async function deleteUserById(userId: string) {
  return db.delete(user).where(eq(user.id, userId))
}
