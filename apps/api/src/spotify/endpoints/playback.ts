import type { SpotifyClient } from '../client'
import {
  type Cluster,
  type ClusterDevice,
  type DealerSession,
  SPCLIENT_BASE,
  openDealer,
} from '../dealer'

// PlaybackService — reverse-engineered Spotify Connect control. All writes go to
// `gew4-spclient.spotify.com` under `/connect-state/v1/...`. This is exactly what
// open.spotify.com does when you click play/pause/next: it POSTs a command envelope
// from the web player's virtual device to the currently-active real device.
//
// Pattern:
//   POST /connect-state/v1/player/command/from/{virtual}/to/{target}
//     body: { command: { endpoint: "pause" | "resume" | "skip_next" | ..., ...args } }
//
// The virtual device_id is a random 40-char hex we generate per session. The target
// is whichever real device you want to control (phone, desktop app, speaker). We pull
// the active device from the connect-state cluster snapshot on first call.

type RepeatMode = 'off' | 'context' | 'track'

interface PlayContextOptions {
  /** Spotify URI of the context to play: spotify:playlist:..., spotify:album:..., spotify:artist:..., spotify:track:... */
  contextUri: string
  /** Skip to a specific track index in the context. */
  trackIndex?: number
  /** Seek into the first track by N ms. */
  positionMs?: number
  /** Override the target device_id. Defaults to the currently-active device. */
  deviceId?: string
}

interface CommandEnvelope {
  command: Record<string, unknown>
}

const PLAY_ORIGIN = { feature_identifier: 'harmony', feature_version: '4.11.0-af0ef98' } as const

export class PlaybackService {
  constructor(private client: SpotifyClient) {}

  private session: DealerSession | null = null
  private cachedCluster: Cluster | null = null

  private async getSession(): Promise<DealerSession> {
    if (this.session) return this.session
    this.session = await openDealer(this.client.auth.accessToken)
    return this.session
  }

  // Release the dealer WebSocket. Call from CLI scripts before process exit — idle
  // sockets sit around for 90s until Spotify's server tears them down otherwise.
  close(): void {
    if (this.session) {
      this.session.close()
      this.session = null
    }
  }

  // Fetch a full cluster snapshot: every active Connect device + the current
  // player_state. Uses the `hobs_` attach endpoint — the server replies to the PUT
  // with the same payload the dealer websocket streams on cluster_update messages.
  async getCluster(): Promise<Cluster> {
    const session = await this.getSession()
    const url = `${SPCLIENT_BASE}/connect-state/v1/devices/hobs_${session.virtualDeviceId}`
    const resp = await this.client.put(
      url,
      {
        member_type: 'CONNECT_STATE',
        device: { device_info: { capabilities: { can_be_player: false, hidden: true } } },
      },
      { 'x-spotify-connection-id': session.connectionId },
    )
    const parsed = JSON.parse(resp.data) as Cluster
    this.cachedCluster = parsed
    return parsed
  }

  async listDevices(): Promise<ClusterDevice[]> {
    const cluster = await this.getCluster()
    return Object.values(cluster.devices ?? {})
  }

  async getActiveDeviceId(): Promise<string | null> {
    const cluster = this.cachedCluster ?? (await this.getCluster())
    return cluster.active_device_id || null
  }

  private async resolveDevice(deviceId?: string): Promise<string> {
    if (deviceId) return deviceId
    const active = await this.getActiveDeviceId()
    if (!active) {
      throw new Error(
        'no active Spotify device. Start playback in a Spotify app first, or pass --device <id>. Run `listDevices()` to see options.',
      )
    }
    return active
  }

  // Send a raw command envelope to /connect-state/v1/player/command/from/.../to/...
  private async sendCommand(command: Record<string, unknown>, deviceId?: string): Promise<void> {
    const session = await this.getSession()
    const target = await this.resolveDevice(deviceId)
    const url = `${SPCLIENT_BASE}/connect-state/v1/player/command/from/${session.virtualDeviceId}/to/${target}`
    const body: CommandEnvelope = { command }
    await this.client.post(url, body)
  }

  async pause(deviceId?: string): Promise<void> {
    await this.sendCommand({ endpoint: 'pause' }, deviceId)
  }

  async resume(deviceId?: string): Promise<void> {
    await this.sendCommand({ endpoint: 'resume' }, deviceId)
  }

  async next(deviceId?: string): Promise<void> {
    await this.sendCommand({ endpoint: 'skip_next' }, deviceId)
  }

  async previous(deviceId?: string): Promise<void> {
    await this.sendCommand({ endpoint: 'skip_prev' }, deviceId)
  }

  async seek(positionMs: number, deviceId?: string): Promise<void> {
    await this.sendCommand({ endpoint: 'seek_to', value: positionMs }, deviceId)
  }

  async setShuffle(on: boolean, deviceId?: string): Promise<void> {
    await this.sendCommand({ endpoint: 'set_shuffling_context', value: on }, deviceId)
  }

  async setRepeat(mode: RepeatMode, deviceId?: string): Promise<void> {
    await this.sendCommand(
      {
        endpoint: 'set_options',
        repeating_context: mode !== 'off',
        repeating_track: mode === 'track',
      },
      deviceId,
    )
  }

  async addToQueue(trackUri: string, deviceId?: string): Promise<void> {
    await this.sendCommand(
      {
        endpoint: 'add_to_queue',
        track: { uri: trackUri, metadata: { is_queued: 'true' }, provider: 'queue' },
      },
      deviceId,
    )
  }

  // Start playback of a context (playlist/album/artist/track URI). The web player
  // always sends `context.url = "context://<uri>"` even though the uri is enough —
  // keep parity with live captures so the command isn't rejected.
  async playContext(opts: PlayContextOptions): Promise<void> {
    await this.sendCommand(
      {
        endpoint: 'play',
        context: {
          uri: opts.contextUri,
          url: `context://${opts.contextUri}`,
          metadata: {},
        },
        play_origin: PLAY_ORIGIN,
        options: {
          license: 'on-demand',
          skip_to: { track_index: opts.trackIndex ?? 0 },
          player_options_override: {},
          ...(opts.positionMs ? { seek_to: opts.positionMs } : {}),
        },
      },
      opts.deviceId,
    )
  }

  // Volume uses a different path + PUT, not the command envelope. Spotify stores
  // volume as 0..65535 internally; we accept percent 0..100 for ergonomics.
  async setVolume(percent: number, deviceId?: string): Promise<void> {
    if (percent < 0 || percent > 100) throw new Error(`volume out of range: ${percent}`)
    const session = await this.getSession()
    const target = await this.resolveDevice(deviceId)
    const url = `${SPCLIENT_BASE}/connect-state/v1/connect/volume/from/${session.virtualDeviceId}/to/${target}`
    const raw = Math.round((percent * 65535) / 100)
    await this.client.put(url, { volume: raw })
  }

  // Transfer the playback "lock" to another device. `restore_paused: "restore"`
  // keeps whatever pause/play state the source device had; "pause" forces a pause
  // on transfer, "play" forces resume.
  async transfer(
    deviceId: string,
    restore: 'restore' | 'pause' | 'play' = 'restore',
  ): Promise<void> {
    const session = await this.getSession()
    const url = `${SPCLIENT_BASE}/connect-state/v1/connect/transfer/from/${session.virtualDeviceId}/to/${deviceId}`
    await this.client.post(url, { transfer_options: { restore_paused: restore } })
  }
}
