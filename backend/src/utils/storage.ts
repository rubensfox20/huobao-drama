
import fs from 'fs'
import path from 'path'
import dns from 'node:dns/promises'
import net from 'node:net'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const STORAGE_ROOT = path.resolve(process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static'))
const STATIC_PREFIX = 'static/'
const BLOCKED_DOWNLOAD_HOSTS = new Set([
  'localhost',
  'host.docker.internal',
])

function allowPrivateDownloads() {
  return ['1', 'true', 'yes'].includes(String(process.env.HUOBAO_ALLOW_PRIVATE_DOWNLOADS || '').trim().toLowerCase())
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
}

function parseIpv4(value: string) {
  const parts = value.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts
}

function isPrivateOrReservedIpv4(value: string) {
  const parts = parseIpv4(value)
  if (!parts) return false
  const [a, b, c] = parts

  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
}

function parseMappedIpv4(value: string) {
  const dotted = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (dotted) return dotted

  const hex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!hex) return null

  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

function isPrivateOrReservedIpv6(value: string) {
  const normalized = value.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true

  const mappedIpv4 = parseMappedIpv4(normalized)
  if (mappedIpv4) return isPrivateOrReservedIpv4(mappedIpv4)

  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16)
  if (!Number.isInteger(firstHextet)) return false
  if ((firstHextet & 0xffc0) === 0xfe80) return true
  if ((firstHextet & 0xfe00) === 0xfc00) return true
  if ((firstHextet & 0xff00) === 0xff00) return true
  if (normalized.startsWith('2001:db8:')) return true

  return false
}

function isPrivateOrReservedIp(value: string) {
  const family = net.isIP(value)
  if (family === 4) return isPrivateOrReservedIpv4(value)
  if (family === 6) return isPrivateOrReservedIpv6(value)
  return false
}

export async function assertSafeDownloadUrl(rawUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(String(rawUrl || '').trim())
  } catch {
    throw new Error('Download URL is invalid')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Download URL must use http or https')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Download URL credentials are not allowed')
  }

  const hostname = normalizeHostname(parsed.hostname)
  if (!hostname) throw new Error('Download URL host is required')
  if (allowPrivateDownloads()) return

  if (BLOCKED_DOWNLOAD_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
    throw new Error('Download URL host is private or reserved')
  }
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new Error('Download URL host is private or reserved')
    return
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new Error('Download URL host could not be resolved')
  }
  if (!addresses.length) throw new Error('Download URL host could not be resolved')
  if (addresses.some(entry => isPrivateOrReservedIp(entry.address))) {
    throw new Error('Download URL resolves to a private or reserved address')
  }
}

function assertInsideStorage(candidatePath: string): string {
  const relative = path.relative(STORAGE_ROOT, candidatePath)
  if (relative && (relative.startsWith('..') || path.isAbsolute(relative))) {
    throw new Error('Storage path escapes storage root')
  }
  return candidatePath
}

function normalizeStorageRelativePath(inputPath: string): string {
  const rawPath = String(inputPath || '').trim()
  if (!rawPath) throw new Error('Storage path is required')
  if (rawPath.includes('\0')) throw new Error('Storage path is invalid')

  const slashPath = rawPath.replace(/\\/g, '/')
  const localStaticPath = slashPath.startsWith(`/${STATIC_PREFIX}`)
    ? slashPath.slice(1)
    : slashPath

  if (
    path.isAbsolute(localStaticPath) ||
    path.win32.isAbsolute(localStaticPath) ||
    path.posix.isAbsolute(localStaticPath)
  ) {
    throw new Error('Absolute storage paths are not allowed')
  }

  return localStaticPath.startsWith(STATIC_PREFIX)
    ? localStaticPath.slice(STATIC_PREFIX.length)
    : localStaticPath
}

export function resolveStoragePath(relativePath: string): string {
  const normalizedPath = normalizeStorageRelativePath(relativePath)
  return assertInsideStorage(path.resolve(STORAGE_ROOT, normalizedPath))
}


export async function downloadFile(url: string, subDir: string): Promise<string> {
  await assertSafeDownloadUrl(url)

  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  const ext = getExtFromUrl(url)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)

  const buffer = Buffer.from(await resp.arrayBuffer())
  fs.writeFileSync(filePath, buffer)


  return `static/${subDir}/${filename}`
}


export async function saveUploadedFile(data: ArrayBuffer, subDir: string, originalName: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  const ext = path.extname(originalName) || '.bin'
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  fs.writeFileSync(filePath, Buffer.from(data))
  return `static/${subDir}/${filename}`
}

function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname)
    if (ext && ext.length <= 5) return ext
  } catch {}
  return '.bin'
}


export function getAbsolutePath(relativePath: string): string {
  return resolveStoragePath(relativePath)
}


export async function saveBase64Image(base64Data: string, mimeType: string, subDir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })


  const ext = mimeTypeToExt(mimeType)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const buffer = Buffer.from(base64Data, 'base64')
  fs.writeFileSync(filePath, buffer)

  return `static/${subDir}/${filename}`
}

export function readImageAsDataUrl(relativePath: string): string {
  const filePath = getAbsolutePath(relativePath)
  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = extToMimeType(ext)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function readImageAsCompressedDataUrl(
  relativePath: string,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {},
): Promise<string> {
  const filePath = getAbsolutePath(relativePath)
  const maxWidth = options.maxWidth ?? 768
  const maxHeight = options.maxHeight ?? 768
  const quality = options.quality ?? 68

  const resized = sharp(filePath).rotate().resize({
    width: maxWidth,
    height: maxHeight,
    fit: 'inside',
    withoutEnlargement: true,
  })
  const metadata = await resized.metadata()
  const output = metadata.hasAlpha
    ? await resized.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer()
    : await resized.jpeg({ quality, mozjpeg: true }).toBuffer()
  const mimeType = 'image/jpeg'
  return `data:${mimeType};base64,${output.toString('base64')}`
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    mimeType: match[1],
    data: match[2],
  }
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
  }
  return map[mimeType] || '.png'
}

function extToMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  return map[ext] || 'image/png'
}
