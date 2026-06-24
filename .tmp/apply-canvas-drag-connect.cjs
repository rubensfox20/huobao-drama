const { readFileSync, writeFileSync } = require('node:fs')
const path = 'frontend/app/pages/index.vue'
let source = readFileSync(path, 'utf8')
function replaceOnce(from, to) {
  if (!source.includes(from)) {
    throw new Error('Trecho nao encontrado: ' + from.slice(0, 120).replace(/\n/g, '\\n'))
  }
  source = source.replace(from, to)
}
replaceOnce(
`        <section class="production-canvas-board" :style="canvasBoardStyle" @click="closeScreenMenus">
          <div class="canvas-role-cluster">`,
`        <section ref="canvasBoardRef" class="production-canvas-board" :style="canvasBoardStyle" @click="closeScreenMenus">
          <svg class="canvas-connection-layer" aria-hidden="true">
            <line v-for="line in canvasConnectionLines" :key="line.id" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" />
          </svg>
          <div class="canvas-role-cluster">`
)
replaceOnce(
`            <article v-for="(item, index) in productionAssets.roles" :key="'role-canvas-' + index" class="canvas-node canvas-role-node" :class="{ enlarged: isBlankProductionAsset(item) }">
              <header><CircleUserRound :size="15" />{{ item.name }}</header>`,
`            <article v-for="(item, index) in productionAssets.roles" :key="'role-canvas-' + index" class="canvas-node canvas-role-node" :class="{ enlarged: isBlankProductionAsset(item), linking: isCanvasNodeLinking('roles', index) }" :style="canvasNodeStyle('roles', index)" @click.stop="handleCanvasNodeClick('roles', index)">
              <header @pointerdown.stop="startCanvasNodeDrag($event, 'roles', index)"><CircleUserRound :size="15" />{{ item.name }}</header>`
)
replaceOnce(
`              <div class="canvas-node-card">
                <span v-if="item.main" class="canvas-main-pill">Protagonist</span>`,
`              <div class="canvas-node-card" @pointerdown.stop="startCanvasNodeDrag($event, 'roles', index)">
                <span v-if="item.main" class="canvas-main-pill">Protagonist</span>`
)
replaceOnce(
`            <article v-for="(item, index) in productionAssets.scenes" :key="'scene-canvas-' + index" class="canvas-node canvas-scene-node" :class="'scene-pos-' + (index % 6)">
              <header><Image :size="14" />{{ item.name }}</header>`,
`            <article v-for="(item, index) in productionAssets.scenes" :key="'scene-canvas-' + index" class="canvas-node canvas-scene-node" :class="['scene-pos-' + (index % 6), { linking: isCanvasNodeLinking('scenes', index) }]" :style="canvasNodeStyle('scenes', index)" @click.stop="handleCanvasNodeClick('scenes', index)">
              <header @pointerdown.stop="startCanvasNodeDrag($event, 'scenes', index)"><Image :size="14" />{{ item.name }}</header>`
)
replaceOnce(
`              <div class="canvas-node-card">
                <div class="canvas-node-preview"><Image :size="38" /></div>`,
`              <div class="canvas-node-card" @pointerdown.stop="startCanvasNodeDrag($event, 'scenes', index)">
                <div class="canvas-node-preview"><Image :size="38" /></div>`
)
source = source.replace(/          <button type="button" aria-label="[^"]+"><Share2 :size="18" \/><\/button>/, `          <button type="button" :class="{ active: canvasConnectMode }" aria-label="Conexoes" @click.stop="toggleCanvasConnectMode"><Share2 :size="18" /></button>`)
if (!source.includes('toggleCanvasConnectMode"><Share2')) throw new Error('Botao de conexoes nao encontrado')
replaceOnce(
`const screenHelpOpen = ref(false)
const canvasZoom = ref(100)`,
`const screenHelpOpen = ref(false)
const canvasBoardRef = ref(null)
const canvasNodePositions = ref({})
const canvasConnections = ref([])
const canvasConnectMode = ref(false)
const canvasLinkStart = ref(null)
const canvasDragState = ref(null)
const canvasDragMoved = ref(false)
const canvasZoom = ref(100)`
)
replaceOnce(
`const agentStep = computed(() => episodeStageOpen.value ? 3 : productionAssetsReady.value ? 2 : 1)
const canvasBoardStyle = computed(() => ({ transform: \`scale(\${canvasZoom.value / 100})\` }))
const analysisPreviewEpisodes = computed(() => productionPayloadEpisodes().slice(0, 5))`,
`const agentStep = computed(() => episodeStageOpen.value ? 3 : productionAssetsReady.value ? 2 : 1)
const canvasBoardStyle = computed(() => ({ transform: \`scale(\${canvasZoom.value / 100})\` }))
const canvasConnectionLines = computed(() => canvasConnections.value
  .map(connection => ({ id: connection.from + '-' + connection.to, ...canvasConnectionLine(connection.from, connection.to) }))
  .filter(line => line.x1 !== null))
const analysisPreviewEpisodes = computed(() => productionPayloadEpisodes().slice(0, 5))`
)
replaceOnce(
`function closeScreenMenus() {
  addNodeMenuOpen.value = false
  screenHelpOpen.value = false
  openProductionAssetMenuKey.value = ''
}

function clampCanvasZoom(value) {`,
`function closeScreenMenus() {
  addNodeMenuOpen.value = false
  screenHelpOpen.value = false
  openProductionAssetMenuKey.value = ''
}

function canvasNodeKey(type, index) {
  return type + ':' + index
}

function defaultCanvasNodePosition(type, index) {
  if (type === 'scenes') {
    const positions = [
      { x: 1640, y: 72 },
      { x: 2360, y: 72 },
      { x: 3080, y: 72 },
      { x: 1980, y: 520 },
      { x: 2360, y: 378 },
      { x: 2880, y: 520 },
    ]
    return positions[index] || { x: 1640 + (index % 3) * 720, y: 72 + Math.floor(index / 3) * 448 }
  }
  return { x: 250 + (index % 3) * 440, y: 52 + Math.floor(index / 3) * 570 }
}

function canvasNodePosition(type, index) {
  return canvasNodePositions.value[canvasNodeKey(type, index)] || defaultCanvasNodePosition(type, index)
}

function canvasNodeStyle(type, index) {
  const position = canvasNodePosition(type, index)
  return { left: position.x + 'px', top: position.y + 'px' }
}

function canvasNodeSize(type, index) {
  if (type === 'scenes') return { width: 632, height: 388 }
  const item = productionAssets.value.roles[index]
  return isBlankProductionAsset(item) ? { width: 416, height: 512 } : { width: 374, height: 444 }
}

function canvasNodeCenter(key) {
  const [type, rawIndex] = key.split(':')
  const index = Number(rawIndex)
  if (!Number.isFinite(index)) return null
  const position = canvasNodePosition(type, index)
  const size = canvasNodeSize(type, index)
  return { x: position.x + size.width / 2, y: position.y + size.height / 2 }
}

function canvasConnectionLine(from, to) {
  const start = canvasNodeCenter(from)
  const end = canvasNodeCenter(to)
  if (!start || !end) return { x1: null, y1: null, x2: null, y2: null }
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

function startCanvasNodeDrag(event, type, index) {
  if (event.button !== undefined && event.button !== 0) return
  canvasDragMoved.value = false
  const position = canvasNodePosition(type, index)
  canvasDragState.value = {
    key: canvasNodeKey(type, index),
    type,
    index,
    startX: event.clientX,
    startY: event.clientY,
    x: position.x,
    y: position.y,
  }
  window.addEventListener('pointermove', moveCanvasNode)
  window.addEventListener('pointerup', stopCanvasNodeDrag, { once: true })
}

function moveCanvasNode(event) {
  const drag = canvasDragState.value
  if (!drag) return
  const scale = canvasZoom.value / 100 || 1
  const nextX = Math.max(0, drag.x + (event.clientX - drag.startX) / scale)
  const nextY = Math.max(0, drag.y + (event.clientY - drag.startY) / scale)
  canvasDragMoved.value = true
  canvasNodePositions.value = { ...canvasNodePositions.value, [drag.key]: { x: Math.round(nextX), y: Math.round(nextY) } }
}

function stopCanvasNodeDrag() {
  window.removeEventListener('pointermove', moveCanvasNode)
  canvasDragState.value = null
  window.setTimeout(() => { canvasDragMoved.value = false }, 0)
}

function toggleCanvasConnectMode() {
  canvasConnectMode.value = !canvasConnectMode.value
  canvasLinkStart.value = null
  closeScreenMenus()
}

function isCanvasNodeLinking(type, index) {
  return canvasLinkStart.value === canvasNodeKey(type, index)
}

function handleCanvasNodeClick(type, index) {
  if (canvasDragMoved.value || !canvasConnectMode.value) return
  const key = canvasNodeKey(type, index)
  if (!canvasLinkStart.value) {
    canvasLinkStart.value = key
    return
  }
  if (canvasLinkStart.value !== key) {
    const exists = canvasConnections.value.some(connection =>
      (connection.from === canvasLinkStart.value && connection.to === key) ||
      (connection.from === key && connection.to === canvasLinkStart.value),
    )
    if (!exists) canvasConnections.value = [...canvasConnections.value, { from: canvasLinkStart.value, to: key }]
  }
  canvasLinkStart.value = null
}

function clampCanvasZoom(value) {`
)
replaceOnce(
`  const list = productionAssets.value[target]
  if (!Array.isArray(list)) return
  const name = target === 'roles' ? 'Unnamed role' : target === 'scenes' ? 'Unnamed scene' : target === 'objects' ? 'Novo ativo' : 'Novo material'
  list.push({ name, status: target === 'roles' ? 'å¾…è¡¥å……' : 'A ser adicionado', images: 1, blank: true })`,
`  const list = productionAssets.value[target]
  if (!Array.isArray(list)) return
  const nextIndex = list.length
  const name = target === 'roles' ? 'Unnamed role' : target === 'scenes' ? 'Unnamed scene' : target === 'objects' ? 'Novo ativo' : 'Novo material'
  list.push({ name, status: target === 'roles' ? 'å¾…è¡¥å……' : 'A ser adicionado', images: 1, blank: true })
  if (target === 'roles' || target === 'scenes') {
    canvasNodePositions.value = { ...canvasNodePositions.value, [canvasNodeKey(target, nextIndex)]: defaultCanvasNodePosition(target, nextIndex) }
  }`
)
replaceOnce(
`.canvas-role-cluster,
.canvas-scene-cluster {
  position: absolute;
}

.canvas-role-cluster {
  top: 52px;
  left: 250px;
  width: 1280px;
  display: grid;
  grid-template-columns: repeat(3, 360px);
  gap: 118px 80px;
}

.canvas-scene-cluster {
  top: 72px;
  left: 1640px;
  width: 1760px;
  min-height: 780px;
}

.canvas-node {
  position: relative;
}

.canvas-scene-node {
  position: absolute;
}`, 
`.canvas-connection-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.canvas-connection-layer line {
  stroke: #9ea6ad;
  stroke-width: 3;
  stroke-linecap: round;
}

.canvas-role-cluster,
.canvas-scene-cluster {
  position: static;
}

.canvas-node {
  position: absolute;
  z-index: 3;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.canvas-node:active {
  cursor: grabbing;
}

.canvas-scene-node {
  position: absolute;
}`
)
replaceOnce(
`.scene-pos-0 { top: 0; left: 0; }
.scene-pos-1 { top: 0; left: 360px; }
.scene-pos-2 { top: 0; left: 930px; }
.scene-pos-3 { top: 430px; left: 300px; }
.scene-pos-4 { top: 300px; left: 650px; }
.scene-pos-5 { top: 430px; left: 1080px; }

`,
``
)
replaceOnce(
`.canvas-node-card:hover > button {
  opacity: 1;
  color: #111;
}


.production-canvas-main {`,
`.canvas-node-card:hover > button {
  opacity: 1;
  color: #111;
}

.canvas-node.linking .canvas-node-card {
  border-color: #8157ff;
  box-shadow: 0 0 0 4px rgba(129, 87, 255, 0.25), 0 16px 32px rgba(0, 0, 0, 0.08);
}

.production-canvas-main {`
)
replaceOnce(
`.canvas-scene-cluster::before {
  content: '';
  position: absolute;
  top: -42px;
  left: -44px;
  right: -44px;
  bottom: -70px;
  border-radius: 42px;
  background: rgba(210, 214, 217, 0.52);
  pointer-events: none;
}

.canvas-scene-cluster::after {
  content: 'group';
  position: absolute;
  top: -34px;
  left: -24px;
  color: #7f8891;
  font-size: 13px;
  font-weight: 700;
}`, 
`.canvas-scene-cluster::before {
  content: '';
  position: absolute;
  top: 30px;
  left: 1580px;
  z-index: 0;
  width: 1900px;
  height: 920px;
  border-radius: 42px;
  background: rgba(210, 214, 217, 0.52);
  pointer-events: none;
}

.canvas-scene-cluster::after {
  content: 'group';
  position: absolute;
  top: 38px;
  left: 1600px;
  z-index: 2;
  color: #7f8891;
  font-size: 13px;
  font-weight: 700;
}`
)
replaceOnce(
`.canvas-create-node {
  align-self: start;
}`, 
`.canvas-create-node {
  z-index: 2;
  cursor: default;
}`
)
replaceOnce(
`.scene-pos-create {
  top: 430px;
  left: 1720px;
}`, 
`.canvas-role-cluster .canvas-create-node {
  left: 1130px;
  top: 52px;
}

.scene-pos-create {
  top: 502px;
  left: 1640px;
}`
)
writeFileSync(path, source)
console.log('canvas drag/connect patch applied')




