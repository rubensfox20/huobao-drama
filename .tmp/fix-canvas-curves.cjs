const { readFileSync, writeFileSync } = require('node:fs')
const path = 'frontend/app/pages/index.vue'
let source = readFileSync(path, 'utf8')
function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error('Trecho nao encontrado: ' + label)
  source = source.replace(from, to)
}
replaceOnce(
  `<line v-for="line in canvasConnectionLines" :key="line.id" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" />`,
  `<path v-for="path in canvasConnectionPaths" :key="path.id" :d="path.d" />`,
  'svg line'
)
replaceOnce(
  `const canvasConnectionLines = computed(() => canvasConnections.value\n  .map(connection => ({ id: connection.from + '-' + connection.to, ...canvasConnectionLine(connection.from, connection.to) }))\n  .filter(line => line.x1 !== null))`,
  `const canvasConnectionPaths = computed(() => canvasConnections.value\n  .map(connection => ({ id: connection.from + '-' + connection.to, d: canvasConnectionPath(connection.from, connection.to) }))\n  .filter(connection => connection.d))`,
  'connection computed'
)
replaceOnce(
  `function canvasNodeCenter(key) {\n  const [type, rawIndex] = key.split(':')\n  const index = Number(rawIndex)\n  if (!Number.isFinite(index)) return null\n  const position = canvasNodePosition(type, index)\n  const size = canvasNodeSize(type, index)\n  return { x: position.x + size.width / 2, y: position.y + size.height / 2 }\n}\n\nfunction canvasConnectionLine(from, to) {\n  const start = canvasNodeCenter(from)\n  const end = canvasNodeCenter(to)\n  if (!start || !end) return { x1: null, y1: null, x2: null, y2: null }\n  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }\n}`,
  `function canvasNodeBounds(key) {\n  const [type, rawIndex] = key.split(':')\n  const index = Number(rawIndex)\n  if (!Number.isFinite(index)) return null\n  const position = canvasNodePosition(type, index)\n  const size = canvasNodeSize(type, index)\n  return {\n    left: position.x,\n    right: position.x + size.width,\n    top: position.y,\n    bottom: position.y + size.height,\n    centerX: position.x + size.width / 2,\n    centerY: position.y + size.height / 2,\n  }\n}\n\nfunction canvasConnectionPath(from, to) {\n  const startBounds = canvasNodeBounds(from)\n  const endBounds = canvasNodeBounds(to)\n  if (!startBounds || !endBounds) return ''\n  const startOnLeft = startBounds.centerX > endBounds.centerX\n  const startX = startOnLeft ? startBounds.left : startBounds.right\n  const endX = startOnLeft ? endBounds.right : endBounds.left\n  const startY = startBounds.centerY\n  const endY = endBounds.centerY\n  const distance = Math.max(180, Math.abs(endX - startX) * 0.46)\n  const direction = startOnLeft ? -1 : 1\n  const controlX1 = startX + distance * direction\n  const controlX2 = endX - distance * direction\n  return \`M \${startX} \${startY} C \${controlX1} \${startY}, \${controlX2} \${endY}, \${endX} \${endY}\`\n}`,
  'connection functions'
)
replaceOnce(
  `  const nextY = Math.max(36, drag.y + (event.clientY - drag.startY) / scale)`,
  `  const nextY = drag.y + (event.clientY - drag.startY) / scale`,
  'drag top clamp'
)
replaceOnce(
  `.canvas-connection-layer line {\n  stroke: #9ea6ad;\n  stroke-width: 3;\n  stroke-linecap: round;\n}`,
  `.canvas-connection-layer path {\n  fill: none;\n  stroke: #8d99a8;\n  stroke-width: 3;\n  stroke-linecap: round;\n  filter: drop-shadow(0 2px 2px rgba(92, 104, 118, 0.22));\n}`,
  'connection css'
)
writeFileSync(path, source, 'utf8')
console.log('curved connections applied')
