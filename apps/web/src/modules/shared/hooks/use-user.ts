import { authClient } from '@shared/lib/auth-client'

export const useUser = () => {
  const session = authClient.useSession()
  return {
    user: session.data?.user ?? null,
    loading: session.isPending,
  }
}
