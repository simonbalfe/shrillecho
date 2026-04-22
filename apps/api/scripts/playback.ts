import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const currentDir = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(currentDir, '../../../.env'), override: true })

import { getSpotifyClient } from '../src/spotify/singleton'

const USAGE = `Usage:
  pnpm --filter @repo/api playback <command> [args] [--device <id>]

Commands:
  status                         Show current player state and active device
  devices                        List all active Spotify Connect devices
  play <uri> [--index N] [--ms]  Start playing a context URI (playlist/album/artist/track)
  pause                          Pause the active device
  resume                         Resume the active device
  next                           Skip to next track
  prev                           Skip to previous track
  seek <ms>                      Seek to position in milliseconds
  volume <0-100>                 Set volume percent
  shuffle <on|off>               Toggle shuffle
  repeat <off|context|track>     Set repeat mode
  queue <track-uri>              Add a track URI to the queue
  transfer <device-id> [--play|--pause]  Transfer playback to a device
`

type Flags = { device?: string; index?: number; ms?: number; mode?: 'play' | 'pause' | 'restore' }

function parseFlags(args: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--device') {
      flags.device = args[++i]
    } else if (a === '--index') {
      flags.index = Number(args[++i])
    } else if (a === '--ms') {
      flags.ms = Number(args[++i])
    } else if (a === '--play') {
      flags.mode = 'play'
    } else if (a === '--pause') {
      flags.mode = 'pause'
    } else if (a !== undefined) {
      positional.push(a)
    }
  }
  return { positional, flags }
}

function fmtMs(raw: string | number | undefined): string {
  const ms = typeof raw === 'string' ? Number(raw) : (raw ?? 0)
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (!command) {
    console.log(USAGE)
    process.exit(1)
  }
  const { positional, flags } = parseFlags(rest)

  const client = await getSpotifyClient()
  const { playback } = client

  try {
    switch (command) {
      case 'status': {
        const cluster = await playback.getCluster()
        const active = cluster.active_device_id
        const dev = active ? cluster.devices?.[active] : null
        const ps = cluster.player_state
        console.log(`active device: ${dev?.name ?? '(none)'} [${active || '-'}]`)
        if (ps?.track) {
          const uri = ps.track.uri
          const title = ps.track.metadata?.title ?? uri
          const artist =
            ps.track.metadata?.artist_name ?? ps.track.metadata?.['album_artist_name'] ?? ''
          console.log(
            `  ${ps.is_paused ? 'paused' : 'playing'}: ${title}${artist ? ` — ${artist}` : ''}`,
          )
          console.log(
            `  position: ${fmtMs(ps.position_as_of_timestamp)}  duration: ${fmtMs(ps.duration)}`,
          )
          if (ps.options) {
            const rep = ps.options.repeating_track
              ? 'track'
              : ps.options.repeating_context
                ? 'context'
                : 'off'
            console.log(`  shuffle: ${ps.options.shuffling_context ? 'on' : 'off'}  repeat: ${rep}`)
          }
        } else {
          console.log('  (no track)')
        }
        break
      }
      case 'devices': {
        const devices = await playback.listDevices()
        const active = await playback.getActiveDeviceId()
        for (const d of devices) {
          const flag = d.device_id === active ? '*' : ' '
          const vol =
            typeof d.volume === 'number' ? `${Math.round((d.volume / 65535) * 100)}%` : '-'
          console.log(`${flag} ${d.device_id}  ${d.device_type.padEnd(10)}  vol=${vol}  ${d.name}`)
        }
        break
      }
      case 'play': {
        const [uri] = positional
        if (!uri) throw new Error('play: missing context URI')
        await playback.playContext({
          contextUri: uri,
          trackIndex: flags.index,
          positionMs: flags.ms,
          deviceId: flags.device,
        })
        console.log(`→ play ${uri}`)
        break
      }
      case 'pause':
        await playback.pause(flags.device)
        console.log('→ pause')
        break
      case 'resume':
        await playback.resume(flags.device)
        console.log('→ resume')
        break
      case 'next':
        await playback.next(flags.device)
        console.log('→ skip_next')
        break
      case 'prev':
        await playback.previous(flags.device)
        console.log('→ skip_prev')
        break
      case 'seek': {
        const ms = Number(positional[0])
        if (!Number.isFinite(ms)) throw new Error('seek: missing <ms>')
        await playback.seek(ms, flags.device)
        console.log(`→ seek ${ms}ms`)
        break
      }
      case 'volume': {
        const pct = Number(positional[0])
        if (!Number.isFinite(pct)) throw new Error('volume: missing <0-100>')
        await playback.setVolume(pct, flags.device)
        console.log(`→ volume ${pct}%`)
        break
      }
      case 'shuffle': {
        const [state] = positional
        if (state !== 'on' && state !== 'off') throw new Error('shuffle: use on|off')
        await playback.setShuffle(state === 'on', flags.device)
        console.log(`→ shuffle ${state}`)
        break
      }
      case 'repeat': {
        const [mode] = positional
        if (mode !== 'off' && mode !== 'context' && mode !== 'track') {
          throw new Error('repeat: use off|context|track')
        }
        await playback.setRepeat(mode, flags.device)
        console.log(`→ repeat ${mode}`)
        break
      }
      case 'queue': {
        const [uri] = positional
        if (!uri) throw new Error('queue: missing <track-uri>')
        await playback.addToQueue(uri, flags.device)
        console.log(`→ queued ${uri}`)
        break
      }
      case 'transfer': {
        const [target] = positional
        if (!target) throw new Error('transfer: missing <device-id>')
        const restore =
          flags.mode === 'play' ? 'play' : flags.mode === 'pause' ? 'pause' : 'restore'
        await playback.transfer(target, restore)
        console.log(`→ transfer → ${target} (${restore})`)
        break
      }
      default:
        console.log(USAGE)
        process.exit(1)
    }
  } finally {
    playback.close()
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('playback failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
