import { DEFAULT_HEADERS } from './constants'
import { getSpotifyDispatcher } from './proxy'
import type { RequestResponse } from './types'

export interface PerformRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  cookies?: Record<string, string>
}

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

export async function performRequest(
  url: string,
  opts: PerformRequestOptions = {},
): Promise<RequestResponse> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }

  if (opts.cookies && Object.keys(opts.cookies).length > 0) {
    const cookieHeader = buildCookieHeader(opts.cookies)
    if (cookieHeader) headers.Cookie = cookieHeader
  }

  const resp = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body,
    // @ts-expect-error — `dispatcher` is supported by Node's undici-backed fetch
    dispatcher: getSpotifyDispatcher(),
  })

  return { status: resp.status, data: await resp.text() }
}

export function withDefaultBrowserHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return { ...DEFAULT_HEADERS, ...headers }
}
