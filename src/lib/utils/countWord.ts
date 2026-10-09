const WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
] as const

/**
 * A count as a capitalised word, for a sentence that opens with it: "Three metals…", "Five ways
 * in." A page that says how many of something it holds should take the number from the list that
 * holds them, so adding a sixth collection changes the sentence rather than contradicting it.
 *
 * Past twelve a numeral reads better than a word, and anything that is not a whole, non-negative
 * number is returned as the numeral it was given.
 */
export function countWord(count: number): string {
  if (Number.isInteger(count) && count >= 0 && count < WORDS.length) return WORDS[count]
  return String(count)
}

export default countWord
