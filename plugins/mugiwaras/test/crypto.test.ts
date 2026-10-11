import { describe, expect, it } from 'vitest'
import { hmacSha256, sha256 } from '../src/crypto.js'

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

// Real `atfield` capture (2026-10): one page token from
// /v1/www/works/one-piece/chapters/1189/pages with the key the site serves
// from /api/atfield/key, and the URL it decrypts to.
const REAL_PAGE_TOKEN =
  'AQAAUQGHescgbhCoVnVzHpvTYphygda9wMxizshrC8Hxj5TCLTaXrC7Vici81TexIBJoBRZGL2lJlqLPC_NNBoIIS3vMOe5TU5y82Fojz4nxcg_aghfG0DlowG0_JySHqmJvuyJKKwGMqzpwuhoqsURWAttuqQaz_K6IleD_o7cHjCZvUoxayf3s9Q'
const REAL_PAGE_KEY = 'SoCEMLs43mfOKs+dh74EuTxAvuLpCvHNaFzEjbT7ZQE='
const REAL_PAGE_URL =
  'https://aurora.snipercache.com/manga/one-piece/cap1189/page-0001-v1785078909692.webp?sig=gTlaJRV1RSTZZhMykzTjXA&exp=1791762957'

describe('sha256', () => {
  it('matches known FIPS 180-4 vectors', () => {
    expect(hex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(hex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    )
  })

  it('hashes inputs longer than one block', () => {
    expect(hex(sha256(new Uint8Array(1000).fill(0x61)))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'
    )
  })
})

describe('hmacSha256', () => {
  it('matches RFC 4231 test cases', () => {
    expect(hex(hmacSha256(new Uint8Array(20).fill(0x0b), utf8('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
    )
    expect(hex(hmacSha256(utf8('Jefe'), utf8('what do ya want for nothing?')))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    )
  })

  it('handles keys longer than the hash block size', () => {
    expect(hex(hmacSha256(new Uint8Array(131).fill(0xaa), utf8('Test Using Larger Than Block-Size Key - Hash Key First')))).toBe(
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'
    )
  })
})

describe('atfield token cipher', () => {
  it('decrypts a real captured page token with the site-served key', () => {
    // Mirrors the plugin's parse + HMAC-CTR-XOR so a cipher drift breaks here.
    const bytes = Uint8Array.from(atob(REAL_PAGE_TOKEN.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const key = Uint8Array.from(atob(REAL_PAGE_KEY), (c) => c.charCodeAt(0))
    const nonce = bytes.subarray(5, 13)
    const ciphertext = bytes.subarray(13)
    const out = new Uint8Array(ciphertext.length)
    let pos = 0
    let counter = 0
    while (pos < out.length) {
      const block = new Uint8Array(nonce.length + 1)
      block.set(nonce, 0)
      block[nonce.length] = counter & 255
      const keystream = hmacSha256(key, block)
      const take = Math.min(keystream.length, out.length - pos)
      for (let i = 0; i < take; i++) out[pos + i] = (ciphertext[pos + i] ?? 0) ^ (keystream[i] ?? 0)
      pos += take
      counter++
    }
    expect(new TextDecoder().decode(out)).toBe(REAL_PAGE_URL)
  })
})
