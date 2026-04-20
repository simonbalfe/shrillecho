import type { SpotifyClient } from '../client'
import { API_URL } from '../constants'

interface UserProfile {
  id: string
}

export class UserService {
  constructor(private client: SpotifyClient) {}

  async getCurrentId(): Promise<string> {
    const resp = await this.client.get(`${API_URL}/me`)
    const profile = JSON.parse(resp.data) as UserProfile
    return profile.id
  }
}
