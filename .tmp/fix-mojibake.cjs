const { readFileSync, writeFileSync } = require('node:fs')
const path = 'frontend/app/pages/index.vue'
let source = readFileSync(path, 'utf8')
const cp1252 = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e],
  ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
])
function decodeMojibake(text) {
  const bytes = []
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code <= 0xff) bytes.push(code)
    else if (cp1252.has(ch)) bytes.push(cp1252.get(ch))
    else return text
  }
  const decoded = Buffer.from(bytes).toString('utf8')
  return decoded.includes('\uFFFD') ? text : decoded
}
source = source.replace(/[\u00c0-\u00ff\u0080-\u009f\u2018-\u201d\u2020\u2026\u2030\u0160\u0161\u017d\u017e\u0152\u0153]+(?:[\u00c0-\u00ff\u0080-\u009f\u2018-\u201d\u2020\u2026\u2030\u0160\u0161\u017d\u017e\u0152\u0153\w\s.,;:!?()\[\]{}'"`+\-\/\\|@#$%&*=<>~^]+)?/g, match => {
  if (!/[ÃÂâåæï]/.test(match)) return match
  return decodeMojibake(match)
})
source = source
  .replace(/at\? uma/g, 'até uma')
  .replace(/Conexoes/g, 'Conexões')
  .replace(/Opcoes/g, 'Opções')
writeFileSync(path, source, 'utf8')
console.log('mojibake fixed')
