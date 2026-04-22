import { randomBytes } from 'node:crypto'

// Dealer WebSocket + connect-state snapshot. Reverse-engineered from the web player:
//   1. Connect wss://gew4-dealer.spotify.com/?access_token=... → first message carries
//      a `Spotify-Connection-Id` header.
//   2. PUT https://gew4-spclient.spotify.com/connect-state/v1/devices/hobs_{virtual_id}
//      with that connection-id → server replies with the full Connect cluster state
//      (every active device, the currently-active device_id, player_state).
//
// For one-shot reads (list devices / find active) we open the WS, take the first
// Spotify-Connection-Id, do the PUT, and close. For a long-lived remote-control we'd
// keep the socket open and consume cluster_update push messages.

const DEALER_URL = 'wss://gew4-dealer.spotify.com'
const SPCLIENT_BASE = 'https://gew4-spclient.spotify.com'

export interface ClusterDevice {
  device_id: string
  device_type: string
  name: string
  brand?: string
  model?: string
  volume?: number
  can_play?: boolean
  is_private_session?: boolean
  capabilities?: Record<string, unknown>
}

export interface PlayerState {
  is_paused: boolean
  is_playing: boolean
  timestamp: string
  position_as_of_timestamp: string
  duration?: string
  track?: { uri: string; metadata?: Record<string, string> }
  options?: { shuffling_context?: boolean; repeating_context?: boolean; repeating_track?: boolean }
  queue_revision?: string
  next_tracks?: Array<{ uri: string; metadata?: Record<string, unknown>; provider?: string }>
}

export interface Cluster {
  active_device_id: string
  devices: Record<string, ClusterDevice>
  player_state: PlayerState
  server_timestamp_ms?: number
}

export interface HobsResponse extends Cluster {
  // Raw `PUT hobs_` envelope sometimes nests under `.player_state` / `.devices` directly.
}

// Virtual device_id used as the "from" in command URLs. Spotify doesn't require us to
// register it as a real track-playback device to send commands — any 40-char id works.
export function newVirtualDeviceId(): string {
  return randomBytes(20).toString('hex')
}

interface DealerFirstMessage {
  connectionId: string
}

async function readConnectionId(
  accessToken: string,
  timeoutMs = 10_000,
): Promise<DealerFirstMessage & { close: () => void }> {
  const url = `${DEALER_URL}/?access_token=${encodeURIComponent(accessToken)}`
  const ws = new WebSocket(url)

  const connectionId = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`dealer: no connection-id in ${timeoutMs}ms`))
      try {
        ws.close()
      } catch {}
    }, timeoutMs)

    ws.addEventListener('error', (ev) => {
      clearTimeout(timer)
      reject(
        new Error(`dealer ws error: ${(ev as Event & { message?: string }).message ?? 'unknown'}`),
      )
    })

    ws.addEventListener('message', (ev) => {
      try {
        const data =
          typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer)
        const msg = JSON.parse(data) as { headers?: Record<string, string> }
        const id = msg.headers?.['Spotify-Connection-Id']
        if (id) {
          clearTimeout(timer)
          resolve(id)
        }
      } catch {
        // ignore non-JSON frames
      }
    })
  })

  return {
    connectionId,
    close: () => {
      try {
        ws.close()
      } catch {}
    },
  }
}

export interface DealerSession {
  connectionId: string
  virtualDeviceId: string
  close: () => void
}

// Open a dealer WS long enough to capture the connection-id. Returns a handle with
// `close()` so callers can release the socket once they've issued their PUT / POSTs.
export async function openDealer(accessToken: string): Promise<DealerSession> {
  const { connectionId, close } = await readConnectionId(accessToken)
  return {
    connectionId,
    virtualDeviceId: newVirtualDeviceId(),
    close,
  }
}

export { SPCLIENT_BASE }
