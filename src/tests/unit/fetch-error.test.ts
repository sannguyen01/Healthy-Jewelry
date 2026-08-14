import { describe, it, expect } from 'vitest'

const { describeFetchError, hintForFetchError } = await import(
  '../../../scripts/lib/fetch-error.mjs'
)

/**
 * Node's fetch throws `TypeError: fetch failed` for every network-layer failure there is.
 * The 2026-08-13 smoke run reported exactly that string and nothing else, and it was true
 * of DNS misses, refused connections, TLS failures and timeouts alike — so it distinguished
 * nothing. The cause was in `err.cause` and was discarded by `console.error(err.message)`.
 */
describe('describeFetchError', () => {
  it('surfaces the nested cause that undici hides behind "fetch failed"', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND example.invalid'), {
      code: 'ENOTFOUND',
    })
    const err = Object.assign(new TypeError('fetch failed'), { cause })

    const described = describeFetchError(err)
    expect(described).toContain('fetch failed')
    expect(described).toContain('ENOTFOUND')
  })

  it('walks more than one level, because undici sometimes nests twice', () => {
    const root = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    const mid = Object.assign(new Error('middle'), { cause: root })
    const err = Object.assign(new TypeError('fetch failed'), { cause: mid })
    expect(describeFetchError(err)).toContain('ECONNRESET')
  })

  it('terminates on a cyclic cause rather than hanging a diagnostic script', () => {
    const a = new Error('a')
    const b = new Error('b')
    Object.assign(a, { cause: b })
    Object.assign(b, { cause: a })
    expect(() => describeFetchError(a)).not.toThrow()
  })

  it('degrades to a string for a non-Error throw', () => {
    expect(describeFetchError('nope')).toBe('nope')
  })

  it('does not repeat an identical message twice in the chain', () => {
    const cause = new Error('fetch failed')
    const err = Object.assign(new TypeError('fetch failed'), { cause })
    expect(describeFetchError(err)).toBe('fetch failed')
  })
})

describe('hintForFetchError', () => {
  it('separates a name that does not resolve from a host that refuses', () => {
    expect(hintForFetchError('ENOTFOUND: nope')).toContain('does not resolve')
    expect(hintForFetchError('ECONNREFUSED: nope')).toContain('refused')
  })

  it('names the POST-vs-GET asymmetry, which is what the real failure looked like', () => {
    expect(hintForFetchError('ECONNRESET: socket hang up')).toContain('POST')
  })

  it('returns null rather than guessing at an unrecognised failure', () => {
    expect(hintForFetchError('something entirely new')).toBeNull()
  })
})
