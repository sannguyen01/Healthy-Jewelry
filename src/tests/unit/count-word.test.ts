import { describe, it, expect } from 'vitest'
import { countWord } from '@/lib/utils/countWord'

describe('countWord', () => {
  it.each([
    [0, 'No'],
    [1, 'One'],
    [3, 'Three'],
    [5, 'Five'],
    [12, 'Twelve'],
  ])('writes %i as %s', (count, word) => {
    expect(countWord(count)).toBe(word)
  })

  it('falls back to the numeral past twelve', () => {
    expect(countWord(13)).toBe('13')
    expect(countWord(100)).toBe('100')
  })

  it('returns anything that is not a whole, non-negative number as the numeral it was given', () => {
    expect(countWord(-1)).toBe('-1')
    expect(countWord(2.5)).toBe('2.5')
    expect(countWord(Number.NaN)).toBe('NaN')
  })

  it('reads as the start of a sentence: capitalised', () => {
    for (let n = 0; n <= 12; n++) expect(countWord(n)[0]).toBe(countWord(n)[0].toUpperCase())
  })
})
