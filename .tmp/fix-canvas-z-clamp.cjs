const { readFileSync, writeFileSync } = require('node:fs')
const path = 'frontend/app/pages/index.vue'
let source = readFileSync(path, 'utf8')
function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error('Trecho nao encontrado: ' + label)
  source = source.replace(from, to)
}
replaceOnce(
`const canvasDragState = ref(null)\nconst canvasDragMoved = ref(false)\nconst canvasZoom = ref(100)`,
`const canvasDragState = ref(null)\nconst canvasDragMoved = ref(false)\nconst canvasNodeZIndexes = ref({})\nconst canvasZIndexSeed = ref(10)\nconst canvasZoom = ref(100)`,
'canvas z refs'
)
replaceOnce(
`function canvasNodeStyle(type, index) {\n  const position = canvasNodePosition(type, index)\n  return { left: position.x + 'px', top: position.y + 'px' }\n}`, 
`function canvasNodeStyle(type, index) {\n  const key = canvasNodeKey(type, index)\n  const position = canvasNodePosition(type, index)\n  return {\n    left: position.x + 'px',\n    top: position.y + 'px',\n    zIndex: String(canvasNodeZIndexes.value[key] || 3),\n  }\n}\n\nfunction bringCanvasNodeToFront(key) {\n  canvasZIndexSeed.value += 1\n  canvasNodeZIndexes.value = { ...canvasNodeZIndexes.value, [key]: canvasZIndexSeed.value }\n}`, 
'canvas style z'
)
replaceOnce(
`function startCanvasNodeDrag(event, type, index) {\n  if (event.button !== undefined && event.button !== 0) return\n  canvasDragMoved.value = false\n  const position = canvasNodePosition(type, index)\n  canvasDragState.value = {\n    key: canvasNodeKey(type, index),`,
`function startCanvasNodeDrag(event, type, index) {\n  if (event.button !== undefined && event.button !== 0) return\n  canvasDragMoved.value = false\n  const key = canvasNodeKey(type, index)\n  bringCanvasNodeToFront(key)\n  const position = canvasNodePosition(type, index)\n  canvasDragState.value = {\n    key,`,
'start drag bring front'
)
replaceOnce(
`  const nextX = Math.max(0, drag.x + (event.clientX - drag.startX) / scale)\n  const nextY = drag.y + (event.clientY - drag.startY) / scale`,
`  const nextX = Math.max(0, drag.x + (event.clientX - drag.startX) / scale)\n  const nextY = Math.max(0, drag.y + (event.clientY - drag.startY) / scale)`,
'top clamp'
)
writeFileSync(path, source, 'utf8')
console.log('z-index and top clamp fixed')
