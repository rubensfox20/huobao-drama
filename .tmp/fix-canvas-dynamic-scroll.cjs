const { readFileSync, writeFileSync } = require('node:fs')
const path = 'frontend/app/pages/index.vue'
let source = readFileSync(path, 'utf8')
function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error('Trecho nao encontrado: ' + label)
  source = source.replace(from, to)
}
replaceOnce(
`const agentStep = computed(() => episodeStageOpen.value ? 3 : productionAssetsReady.value ? 2 : 1)\nconst canvasBoardStyle = computed(() => ({ transform: \`scale(\${canvasZoom.value / 100})\` }))`,
`const agentStep = computed(() => episodeStageOpen.value ? 3 : productionAssetsReady.value ? 2 : 1)\nconst canvasBoardMetrics = computed(() => {\n  const padding = 900\n  const bounds = []\n  productionAssets.value.roles.forEach((_, index) => bounds.push(canvasNodeRawBounds('roles', index)))\n  productionAssets.value.scenes.forEach((_, index) => bounds.push(canvasNodeRawBounds('scenes', index)))\n  const validBounds = bounds.filter(Boolean)\n  const minX = Math.min(0, ...validBounds.map(bound => bound.left))\n  const minY = Math.min(0, ...validBounds.map(bound => bound.top))\n  const maxX = Math.max(3720, ...validBounds.map(bound => bound.right))\n  const maxY = Math.max(1560, ...validBounds.map(bound => bound.bottom))\n  return {\n    offsetX: Math.max(0, -minX + padding),\n    offsetY: Math.max(0, -minY + padding),\n    width: maxX - minX + padding * 2,\n    height: maxY - minY + padding * 2,\n  }\n})\nconst canvasBoardStyle = computed(() => ({\n  width: canvasBoardMetrics.value.width + 'px',\n  minHeight: canvasBoardMetrics.value.height + 'px',\n  transform: \`scale(\${canvasZoom.value / 100})\`,\n}))`,
'board metrics computed'
)
replaceOnce(
`function canvasNodePosition(type, index) {\n  return canvasNodePositions.value[canvasNodeKey(type, index)] || defaultCanvasNodePosition(type, index)\n}\n\nfunction canvasNodeStyle(type, index) {\n  const key = canvasNodeKey(type, index)\n  const position = canvasNodePosition(type, index)\n  return {\n    left: position.x + 'px',\n    top: position.y + 'px',\n    zIndex: String(canvasNodeZIndexes.value[key] || 3),\n  }\n}`, 
`function canvasNodePosition(type, index) {\n  return canvasNodePositions.value[canvasNodeKey(type, index)] || defaultCanvasNodePosition(type, index)\n}\n\nfunction canvasNodeViewportPosition(type, index) {\n  const position = canvasNodePosition(type, index)\n  return {\n    x: position.x + canvasBoardMetrics.value.offsetX,\n    y: position.y + canvasBoardMetrics.value.offsetY,\n  }\n}\n\nfunction canvasNodeStyle(type, index) {\n  const key = canvasNodeKey(type, index)\n  const position = canvasNodeViewportPosition(type, index)\n  return {\n    left: position.x + 'px',\n    top: position.y + 'px',\n    zIndex: String(canvasNodeZIndexes.value[key] || 3),\n  }\n}`, 
'viewport position'
)
replaceOnce(
`function canvasNodeBounds(key) {\n  const [type, rawIndex] = key.split(':')\n  const index = Number(rawIndex)\n  if (!Number.isFinite(index)) return null\n  const position = canvasNodePosition(type, index)\n  const size = canvasNodeSize(type, index)\n  return {\n    left: position.x,\n    right: position.x + size.width,\n    top: position.y,\n    bottom: position.y + size.height,\n    centerX: position.x + size.width / 2,\n    centerY: position.y + size.height / 2,\n  }\n}`, 
`function canvasNodeRawBounds(type, index) {\n  const position = canvasNodePosition(type, index)\n  const size = canvasNodeSize(type, index)\n  return {\n    left: position.x,\n    right: position.x + size.width,\n    top: position.y,\n    bottom: position.y + size.height,\n  }\n}\n\nfunction canvasNodeBounds(key) {\n  const [type, rawIndex] = key.split(':')\n  const index = Number(rawIndex)\n  if (!Number.isFinite(index)) return null\n  const position = canvasNodeViewportPosition(type, index)\n  const size = canvasNodeSize(type, index)\n  return {\n    left: position.x,\n    right: position.x + size.width,\n    top: position.y,\n    bottom: position.y + size.height,\n    centerX: position.x + size.width / 2,\n    centerY: position.y + size.height / 2,\n  }\n}`, 
'raw and viewport bounds'
)
source = source.replace(/\.production-canvas-main \{\s+position: relative;\s+min-height: 100vh;\s+padding-top: 0;\s+box-sizing: border-box;\s+overflow: hidden;/, `.production-canvas-main {\n  position: relative;\n  height: 100vh;\n  min-height: 100vh;\n  padding-top: 0;\n  box-sizing: border-box;\n  overflow: auto;\n  scrollbar-width: none;`)
source = source.replace(/\.production-canvas-board \{\s+position: relative;\s+width: 3720px;\s+min-height: 1560px;/, `.production-canvas-board {\n  position: relative;\n  width: 3720px;\n  min-height: 1560px;`)
writeFileSync(path, source, 'utf8')
console.log('canvas dynamic scroll applied')
