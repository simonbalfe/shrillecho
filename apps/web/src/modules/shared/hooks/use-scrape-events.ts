import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

interface ScrapeEvent {
  id: number
  status: string
  artist: string
  depth: number
  totalArtists: number
}

export function useScrapeEvents(onEvent?: (event: ScrapeEvent) => void) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const eventSource = new EventSource('/api/events/scrapes')

    eventSource.onmessage = (e) => {
      const event: ScrapeEvent = JSON.parse(e.data)
      queryClient.invalidateQueries({ queryKey: ['scrapes'] })
      onEvent?.(event)
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => eventSource.close()
  }, [queryClient, onEvent])
}
