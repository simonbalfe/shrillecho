import { createHmac } from 'node:crypto'

export function deriveTotpSecret(cipherBytes: number[]): Buffer {
  const transformed = cipherBytes.map((b, i) => b ^ ((i % 33) + 9))
  const joined = transformed.join('')
  const hex = Buffer.from(joined, 'utf8').toString('hex')
  return Buffer.from(hex, 'hex')
}

export function hotpSha1(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  return (code % 10 ** digits).toString().padStart(digits, '0')
}

export function generateTotp(cipherBytes: number[], serverTimeSec: number): string {
  const secret = deriveTotpSecret(cipherBytes)
  return hotpSha1(secret, Math.floor(serverTimeSec / 30))
}
