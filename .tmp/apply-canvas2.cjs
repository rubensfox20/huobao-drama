const { readFileSync, writeFileSync } = require('node:fs')
const path = 'frontend/app/pages/index.vue'
let source = readFileSync(path, 'utf8')
function must(condition, message) {
  if (!condition) throw new Error(message)
}
function replaceText(from, to, label) {
  must(source.includes(from), 'Trecho nao encontrado: ' + label)
  source = source.replace(from, to)
}
function replaceRegex(regex, to, label) {
  const next = source.replace(regex, to)
  must(next !== source, 'Regex nao alterou: ' + label)
  source = next
}
replaceText(
  '        <section class="production-canvas-board" :style="canvasBoardStyle" @click="closeScreenMenus">\n          <div class="canvas-role-cluster">',
  '        <section ref="canvasBoardRef" class="production-canvas-board" :style="canvasBoardStyle" @click="closeScreenMenus">\n          <svg class="canvas-connection-layer" aria-hidden="true">\n            <line v-for="line in canvasConnectionLines" :key="line.id" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" />\n          </svg>\n          <div class="canvas-role-cluster">',
  'board svg'
)
replaceText(
  '            <article v-for="(item, index) in productionAssets.roles" :key="\'role-canvas-\' + index" class="canvas-node canvas-role-node" :class="{ enlarged: isBlankProductionAsset(item) }">\n              <header><CircleUserRound :size="15" />{{ item.name }}</header>',
  '            <article v-for="(item, index) in productionAssets.roles" :key="\'role-canvas-\' + index" class="canvas-node canvas-role-node" :class="{ enlarged: isBlankProductionAsset(item), linking: isCanvasNodeLinking(\'roles\', index) }" :style="canvasNodeStyle(\'roles\', index)" @click.stop="handleCanvasNodeClick(\'roles\', index)">\n              <header @pointerdown.stop="startCanvasNodeDrag($event, \'roles\', index)"><CircleUserRound :size="15" />{{ item.name }}</header>',
  'role article'
)
replaceText(
  '              <div class="canvas-node-card">\n                <span v-if="item.main" class="canvas-main-pill">Protagonist</span>',
  '              <div class="canvas-node-card" @pointerdown.stop="startCanvasNodeDrag($event, \'roles\', index)">\n                <span v-if="item.main" class="canvas-main-pill">Protagonist</span>',
  'role card drag'
)
replaceText(
  '            <article v-for="(item, index) in productionAssets.scenes" :key="\'scene-canvas-\' + index" class="canvas-node canvas-scene-node" :class="\'scene-pos-\' + (index % 6)">\n              <header><Image :size="14" />{{ item.name }}</header>',
  '            <article v-for="(item, index) in productionAssets.scenes" :key="\'scene-canvas-\' + index" class="canvas-node canvas-scene-node" :class="[\'scene-pos-\' + (index % 6), { linking: isCanvasNodeLinking(\'scenes\', index) }]" :style="canvasNodeStyle(\'scenes\', index)" @click.stop="handleCanvasNodeClick(\'scenes\', index)">\n              <header @pointerdown.stop="startCanvasNodeDrag($event, \'scenes\', index)"><Image :size="14" />{{ item.name }}</header>',
  'scene article'
)
replaceText(
  '              <div class="canvas-node-card">\n                <div class="canvas-node-preview"><Image :size="38" /></div>',
  '              <div class="canvas-node-card" @pointerdown.stop="startCanvasNodeDrag($event, \'scenes\', index)">\n                <div class="canvas-node-preview"><Image :size="38" /></div>',
  'scene card drag'
)
replaceRegex(/          <button type="button" aria-label="[^"]+"><Share2 :size="18" \/><\/button>/, '          <button type="button" :class="{ active: canvasConnectMode }" aria-label="Conexoes" @click.stop="toggleCanvasConnectMode"><Share2 :size="18" /></button>', 'connection button')
replaceText(
  'const screenHelpOpen = ref(false)\nconst canvasZoom = ref(100)',
  'const screenHelpOpen = ref(false)\nconst canvasBoardRef = ref(null)\nconst canvasNodePositions = ref({})\nconst canvasConnections = ref([])\nconst canvasConnectMode = ref(false)\nconst canvasLinkStart = ref(null)\nconst canvasDragState = ref(null)\nconst canvasDragMoved = ref(false)\nconst canvasZoom = ref(100)',
  'canvas refs'
)
replaceText(
  'const canvasBoardStyle = computed(() => ({ transform: `scale(${canvasZoom.value / 100})` }))',
  'const canvasBoardStyle = computed(() => ({ transform: `scale(${canvasZoom.value / 100})` }))\nconst canvasConnectionLines = computed(() => canvasConnections.value\n  .map(connection => ({ id: connection.from + \'-\' + connection.to, ...canvasConnectionLine(connection.from, connection.to) }))\n  .filter(line => line.x1 !== null))',
  'connection computed'
)
replaceText(
  `function closeScreenMenus() {\n  addNodeMenuOpen.value = false\n  screenHelpOpen.value = false\n  openProductionAssetMenuKey.value = ''\n}\n\nfunction clampCanvasZoom(value) {`,
  `function closeScreenMenus() {\n  addNodeMenuOpen.value = false\n  screenHelpOpen.value = false\n  openProductionAssetMenuKey.value = ''\n}\n\nfunction canvasNodeKey(type, index) {\n  return type + ':' + index\n}\n\nfunction defaultCanvasNodePosition(type, index) {\n  if (type === 'scenes') {\n    const positions = [\n      { x: 1640, y: 72 },\n      { x: 2360, y: 72 },\n      { x: 3080, y: 72 },\n      { x: 1980, y: 520 },\n      { x: 2360, y: 378 },\n      { x: 2880, y: 520 },\n    ]\n    return positions[index] || { x: 1640 + (index % 3) * 720, y: 72 + Math.floor(index / 3) * 448 }\n  }\n  return { x: 250 + (index % 3) * 440, y: 52 + Math.floor(index / 3) * 570 }\n}\n\nfunction canvasNodePosition(type, index) {\n  return canvasNodePositions.value[canvasNodeKey(type, index)] || defaultCanvasNodePosition(type, index)\n}\n\nfunction canvasNodeStyle(type, index) {\n  const position = canvasNodePosition(type, index)\n  return { left: position.x + 'px', top: position.y + 'px' }\n}\n\nfunction canvasNodeSize(type, index) {\n  if (type === 'scenes') return { width: 632, height: 388 }\n  const item = productionAssets.value.roles[index]\n  return isBlankProductionAsset(item) ? { width: 416, height: 512 } : { width: 374, height: 444 }\n}\n\nfunction canvasNodeCenter(key) {\n  const [type, rawIndex] = key.split(':')\n  const index = Number(rawIndex)\n  if (!Number.isFinite(index)) return null\n  const position = canvasNodePosition(type, index)\n  const size = canvasNodeSize(type, index)\n  return { x: position.x + size.width / 2, y: position.y + size.height / 2 }\n}\n\nfunction canvasConnectionLine(from, to) {\n  const start = canvasNodeCenter(from)\n  const end = canvasNodeCenter(to)\n  if (!start || !end) return { x1: null, y1: null, x2: null, y2: null }\n  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }\n}\n\nfunction startCanvasNodeDrag(event, type, index) {\n  if (event.button !== undefined && event.button !== 0) return\n  canvasDragMoved.value = false\n  const position = canvasNodePosition(type, index)\n  canvasDragState.value = {\n    key: canvasNodeKey(type, index),\n    type,\n    index,\n    startX: event.clientX,\n    startY: event.clientY,\n    x: position.x,\n    y: position.y,\n  }\n  window.addEventListener('pointermove', moveCanvasNode)\n  window.addEventListener('pointerup', stopCanvasNodeDrag, { once: true })\n}\n\nfunction moveCanvasNode(event) {\n  const drag = canvasDragState.value\n  if (!drag) return\n  const scale = canvasZoom.value / 100 || 1\n  const nextX = Math.max(0, drag.x + (event.clientX - drag.startX) / scale)\n  const nextY = Math.max(0, drag.y + (event.clientY - drag.startY) / scale)\n  canvasDragMoved.value = true\n  canvasNodePositions.value = { ...canvasNodePositions.value, [drag.key]: { x: Math.round(nextX), y: Math.round(nextY) } }\n}\n\nfunction stopCanvasNodeDrag() {\n  window.removeEventListener('pointermove', moveCanvasNode)\n  canvasDragState.value = null\n  window.setTimeout(() => { canvasDragMoved.value = false }, 0)\n}\n\nfunction toggleCanvasConnectMode() {\n  canvasConnectMode.value = !canvasConnectMode.value\n  canvasLinkStart.value = null\n  closeScreenMenus()\n}\n\nfunction isCanvasNodeLinking(type, index) {\n  return canvasLinkStart.value === canvasNodeKey(type, index)\n}\n\nfunction handleCanvasNodeClick(type, index) {\n  if (canvasDragMoved.value || !canvasConnectMode.value) return\n  const key = canvasNodeKey(type, index)\n  if (!canvasLinkStart.value) {\n    canvasLinkStart.value = key\n    return\n  }\n  if (canvasLinkStart.value !== key) {\n    const exists = canvasConnections.value.some(connection =>\n      (connection.from === canvasLinkStart.value && connection.to === key) ||\n      (connection.from === key && connection.to === canvasLinkStart.value),\n    )\n    if (!exists) canvasConnections.value = [...canvasConnections.value, { from: canvasLinkStart.value, to: key }]\n  }\n  canvasLinkStart.value = null\n}\n\nfunction clampCanvasZoom(value) {`,
  'canvas functions'
)
replaceRegex(/  const list = productionAssets\.value\[target\]\r?\n  if \(!Array\.isArray\(list\)\) return\r?\n  const name = ([^\r\n]+)\r?\n  list\.push\(([^\r\n]+)\)/, (match, nameExpr, pushExpr) => `  const list = productionAssets.value[target]\n  if (!Array.isArray(list)) return\n  const nextIndex = list.length\n  const name = ${nameExpr}\n  list.push(${pushExpr})\n  if (target === 'roles' || target === 'scenes') {\n    canvasNodePositions.value = { ...canvasNodePositions.value, [canvasNodeKey(target, nextIndex)]: defaultCanvasNodePosition(target, nextIndex) }\n  }`, 'create node position')
replaceRegex(/\.canvas-role-cluster,\r?\n\.canvas-scene-cluster \{\r?\n  position: absolute;\r?\n\}\r?\n\r?\n\.canvas-role-cluster \{[\s\S]*?\.canvas-scene-node \{\r?\n  position: absolute;\r?\n\}/, `.canvas-connection-layer {\n  position: absolute;\n  inset: 0;\n  z-index: 1;\n  width: 100%;\n  height: 100%;\n  overflow: visible;\n  pointer-events: none;\n}\n\n.canvas-connection-layer line {\n  stroke: #9ea6ad;\n  stroke-width: 3;\n  stroke-linecap: round;\n}\n\n.canvas-role-cluster,\n.canvas-scene-cluster {\n  position: static;\n}\n\n.canvas-node {\n  position: absolute;\n  z-index: 3;\n  cursor: grab;\n  user-select: none;\n  touch-action: none;\n}\n\n.canvas-node:active {\n  cursor: grabbing;\n}\n\n.canvas-scene-node {\n  position: absolute;\n}`, 'canvas positioning css')
replaceRegex(/\.scene-pos-0 \{[^\n]+\}\r?\n\.scene-pos-1 \{[^\n]+\}\r?\n\.scene-pos-2 \{[^\n]+\}\r?\n\.scene-pos-3 \{[^\n]+\}\r?\n\.scene-pos-4 \{[^\n]+\}\r?\n\.scene-pos-5 \{[^\n]+\}\r?\n\r?\n/, '', 'old scene positions')
replaceText(
  `.canvas-node-card:hover > button {\n  opacity: 1;\n  color: #111;\n}\n\n\n.production-canvas-main {`,
  `.canvas-node-card:hover > button {\n  opacity: 1;\n  color: #111;\n}\n\n.canvas-node.linking .canvas-node-card {\n  border-color: #8157ff;\n  box-shadow: 0 0 0 4px rgba(129, 87, 255, 0.25), 0 16px 32px rgba(0, 0, 0, 0.08);\n}\n\n.production-canvas-main {`,
  'linking css'
)
replaceRegex(/\.canvas-scene-cluster::before \{[\s\S]*?\.canvas-scene-cluster::after \{[\s\S]*?font-weight: 700;\r?\n\}/, `.canvas-scene-cluster::before {\n  content: '';\n  position: absolute;\n  top: 30px;\n  left: 1580px;\n  z-index: 0;\n  width: 1900px;\n  height: 920px;\n  border-radius: 42px;\n  background: rgba(210, 214, 217, 0.52);\n  pointer-events: none;\n}\n\n.canvas-scene-cluster::after {\n  content: 'group';\n  position: absolute;\n  top: 38px;\n  left: 1600px;\n  z-index: 2;\n  color: #7f8891;\n  font-size: 13px;\n  font-weight: 700;\n}`, 'scene group css')
replaceText('.canvas-create-node {\n  align-self: start;\n}', '.canvas-create-node {\n  z-index: 2;\n  cursor: default;\n}', 'create node css')
replaceText('.scene-pos-create {\n  top: 430px;\n  left: 1720px;\n}', '.canvas-role-cluster .canvas-create-node {\n  left: 1130px;\n  top: 52px;\n}\n\n.scene-pos-create {\n  top: 502px;\n  left: 1640px;\n}', 'create position css')
writeFileSync(path, source)
console.log('canvas drag/connect applied')
