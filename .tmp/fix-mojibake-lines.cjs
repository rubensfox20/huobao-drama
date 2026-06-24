const { readFileSync, writeFileSync } = require('node:fs')
const path = 'frontend/app/pages/index.vue'
let source = readFileSync(path, 'utf8')
const cp1252 = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e],
  ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
])
function byteFor(ch) {
  const code = ch.codePointAt(0)
  if (code <= 0xff) return code
  if (cp1252.has(ch)) return cp1252.get(ch)
  return null
}
function decodeLine(line) {
  if (!/[ÃÂâåæï]/.test(line)) return line
  const bytes = []
  for (const ch of line) {
    const byte = byteFor(ch)
    if (byte === null) return line
    bytes.push(byte)
  }
  const decoded = Buffer.from(bytes).toString('utf8')
  return decoded.includes('\uFFFD') ? line : decoded
}
source = source.split(/(\r?\n)/).map(part => part === '\n' || part === '\r\n' ? part : decodeLine(part)).join('')
source = source
  .replace(/at\? uma/g, 'até uma')
  .replace(/aria-label="Conexoes"/g, 'aria-label="Conexões"')
  .replace(/aria-label="Opcoes"/g, 'aria-label="Opções"')
writeFileSync(path, source, 'utf8')
console.log('line mojibake fixed')
