import { deleteUserById } from '../db/queries'

export async function deleteUser(sessionUserId: string, targetUserId: string) {
  if (sessionUserId !== targetUserId) {
    throw new UnauthorizedError()
  }

  await deleteUserById(targetUserId)
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}
