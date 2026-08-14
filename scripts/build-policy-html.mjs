import { readFileSync, writeFileSync } from 'node:fs'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) =>
  esc(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, h) => `<a href="${h}">${t}</a>`)
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')

/**
 * Unwrap hard-wrapped paragraphs and list items BEFORE any inline conversion.
 * The markdown is wrapped at ~90 columns, so `**...**` routinely straddles a newline;
 * converting line-by-line leaves the asterisks intact and publishes raw markdown as
 * legal copy.
 */
function unwrap(md) {
  const out = []
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    const isBlank = line.trim() === ''
    const starts = /^(#{1,6}\s|[-*]\s|---\s*$)/.test(line.trim())
    const prev = out[out.length - 1]
    const prevJoinable =
      prev !== undefined && prev.trim() !== '' && !/^(#{1,6}\s|---\s*$)/.test(prev.trim())
    if (!isBlank && !starts && prevJoinable) out[out.length - 1] = `${prev} ${line.trim()}`
    else out.push(line)
  }
  return out
}

function convert(md) {
  const lines = unwrap(md.replace(/<!--[\s\S]*?-->/g, ''))
  const out = []
  let inList = false
  let seenRule = false

  for (const line of lines) {
    if (/^#\s/.test(line)) continue
    if (/^---\s*$/.test(line.trim())) { seenRule = true; continue }
    if (!seenRule) continue // editorial preamble, never a customer's business

    if (/^##\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`)
    } else if (/^[-*]\s+/.test(line.trim())) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(line.trim().replace(/^[-*]\s+/, ''))}</li>`)
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false }
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<p>${inline(line.trim())}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return out.join('\n')
}

const [, , file, outFile] = process.argv
const md = readFileSync(file, 'utf8').replace('[ date you paste this ]', '14 August 2026')
const html = convert(md)

// Nothing on this list may ever reach a customer. Fail the whole run, not this file.
for (const bad of ['{{', '{%', '[ ]', '**', 'Review before pasting', 'TO COMPLETE', '<!--']) {
  if (html.includes(bad)) {
    console.error(`✗ ${file}: output still contains ${JSON.stringify(bad)}`)
    process.exit(1)
  }
}
writeFileSync(outFile, html)
console.log(`✓ ${file} → ${html.length} chars, ${(html.match(/<h2>/g) || []).length} sections`)
