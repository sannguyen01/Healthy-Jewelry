import { describe, expect, it } from 'vitest'
import { firstParam } from '@/lib/http/searchParam'

describe('firstParam', () => {
  it('passes a single value through', () => {
    expect(firstParam('ring')).toBe('ring')
    expect(firstParam('')).toBe('')
  })

  it('takes the first of a repeated parameter, as URLSearchParams.get does', () => {
    // `/search?q=ring&q=band` — the form that threw `.trim is not a function`.
    expect(firstParam(['ring', 'band'])).toBe('ring')
    expect(new URLSearchParams('q=ring&q=band').get('q')).toBe(firstParam(['ring', 'band']))
  })

  it('answers an absent or empty parameter with the empty string', () => {
    expect(firstParam(undefined)).toBe('')
    expect(firstParam([])).toBe('')
  })
})
