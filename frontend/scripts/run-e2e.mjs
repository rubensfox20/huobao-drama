import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const frontendDir = process.cwd()
const backendDir = path.resolve(frontendDir, '../backend')
const bunBin = 'bun'
const playwrightCli = path.join(frontendDir, 'node_modules', 'playwright', 'cli.js')
const playwrightArgs = ['test', ...process.argv.slice(2)]

const managedProcesses = []

function tailLog(text, size = 4000) {
  return text.length > size ? text.slice(-size) : text
}

function killProcessTree(child) {
  if (!child || child.exitCode !== null) return Promise.resolve()

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
    })
  }

  return new Promise((resolve) => {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {}
    resolve()
  })
}

function runCommandCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0 || (process.platform !== 'win32' && code === 1 && !stderr.trim())) {
        resolve(stdout)
        return
      }
      reject(new Error(stderr.trim() || `${command} saiu com codigo ${code}`))
    })
  })
}

async function findPidsByPort(port) {
  if (process.platform === 'win32') {
    const output = await runCommandCapture('netstat', ['-ano', '-p', 'tcp'])
    const pids = new Set()
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue
      const match = line.trim().match(/\s+(\d+)$/)
      if (match) pids.add(Number(match[1]))
    }
    return [...pids]
  }

  const output = await runCommandCapture('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
  return output
    .split(/\r?\n/)
    .map(value => Number(value.trim()))
    .filter(Number.isFinite)
}

async function killPidTree(pid) {
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
    })
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {}
}

async function ensurePortsAreFree(ports) {
  const pids = new Set()
  for (const port of ports) {
    try {
      for (const pid of await findPidsByPort(port)) {
        pids.add(pid)
      }
    } catch {}
  }

  await Promise.allSettled([...pids].map(pid => killPidTree(pid)))
  if (pids.size) {
    await delay(1500)
  }
}

function spawnManagedProcess(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  })

  const state = {
    child,
    label: options.label,
    stdout: '',
    stderr: '',
  }

  child.stdout?.on('data', (chunk) => {
    state.stdout += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    state.stderr += String(chunk)
  })

  managedProcesses.push(state)
  return state
}

async function waitForUrl(url, label, timeoutMs = 120_000) {
  const startedAt = Date.now()
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `${label} respondeu ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(1000)
  }

  throw new Error(`${label} nao ficou pronto em ${timeoutMs}ms. Ultimo erro: ${lastError}`)
}

async function isUrlReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function stopManagedProcesses() {
  await Promise.allSettled(managedProcesses.map(({ child }) => killProcessTree(child)))
}

function printManagedLogs() {
  for (const processState of managedProcesses) {
    const stdout = tailLog(processState.stdout.trim())
    const stderr = tailLog(processState.stderr.trim())
    if (stdout) {
      console.error(`\n[${processState.label} stdout]\n${stdout}`)
    }
    if (stderr) {
      console.error(`\n[${processState.label} stderr]\n${stderr}`)
    }
  }
}

async function run() {
  const backendUrl = 'http://localhost:5679/api/v1/health'
  const frontendUrl = 'http://localhost:3013'

  if (process.env.HUOBAO_E2E_FORCE_FRESH === '1') {
    await ensurePortsAreFree([3013, 5679])
  }

  if (!(await isUrlReady(backendUrl))) {
    spawnManagedProcess(bunBin, ['run', 'dev'], {
      cwd: backendDir,
      env: {
        ...process.env,
        HUOBAO_ADMIN_TOKEN: process.env.HUOBAO_ADMIN_TOKEN || 'huobao-local-admin',
      },
      label: 'backend',
    })
  }

  if (!(await isUrlReady(frontendUrl))) {
    spawnManagedProcess(bunBin, ['run', 'dev'], {
      cwd: frontendDir,
      env: {
        ...process.env,
        NUXT_PUBLIC_ADMIN_TOKEN: process.env.NUXT_PUBLIC_ADMIN_TOKEN || 'huobao-local-admin',
      },
      label: 'frontend',
    })
  }

  try {
    await Promise.all([
      waitForUrl(backendUrl, 'backend'),
      waitForUrl(frontendUrl, 'frontend'),
    ])

    const exitCode = await new Promise((resolve, reject) => {
      const runner = spawn(process.execPath, [playwrightCli, ...playwrightArgs], {
        cwd: frontendDir,
        env: {
          ...process.env,
          PW_SKIP_WEBSERVER: '1',
        },
        stdio: 'inherit',
        windowsHide: true,
      })

      runner.on('exit', (code) => resolve(code ?? 1))
      runner.on('error', reject)
    })

    if (exitCode !== 0) {
      throw new Error(`Playwright saiu com codigo ${exitCode}`)
    }
  } catch (error) {
    printManagedLogs()
    throw error
  } finally {
    await stopManagedProcesses()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
