import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { authMiddleware } from './auth.js'
import { watchSession } from './file-watcher.js'
import { watchSessionLogs } from './logs.js'
import {
    connectPm2,
    deleteBot,
    instanceDir,
    rexifyRoot,
    spawnBot,
    statusBot,
    stopBot,
} from './pm2.js'

const app = Fastify({ logger: true })

await app.register(websocket)

const SECRET = process.env.BOT_RUNNER_SECRET
const PORT = Number(process.env.PORT ?? 4000)

// Wajib ada sejak startup: semua path instance diturunkan dari sini.
const ROOT = rexifyRoot()
const CORE_DIR = path.join(ROOT, 'core')

const CORE_ENTRIES = [
    { name: 'index.js', kind: 'file' },
    { name: 'main.js', kind: 'file' },
    { name: 'handler.js', kind: 'file' },
    { name: 'package.json', kind: 'file' },
    { name: 'plugins', kind: 'dir' },
    { name: 'lib', kind: 'dir' },
    { name: 'node_modules', kind: 'dir' },
]

const requireAuth = { preHandler: authMiddleware(SECRET) }

function coreExists() {
    return existsSync(CORE_DIR)
}

function sessionIdOf(request) {
    return String(request.params?.sessionId ?? '').trim()
}

function internalError(request, reply, error) {
    request.log.error(error)
    return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan di bot runner',
    })
}

// Symlink ke core/ (fallback copy di Windows tanpa hak symlink), sama seperti platform.
async function linkCoreEntries(dir) {
    for (const entry of CORE_ENTRIES) {
        const source = path.join(CORE_DIR, entry.name)
        const target = path.join(dir, entry.name)
        if (existsSync(target)) continue

        try {
            await symlink(
                source,
                target,
                process.platform === 'win32'
                    ? (entry.kind === 'dir' ? 'junction' : 'file')
                    : entry.kind,
            )
        } catch (error) {
            if (process.platform !== 'win32') throw error
            if (entry.kind === 'dir') {
                await cp(source, target, { recursive: true })
            } else {
                await copyFile(source, target)
            }
        }
    }
}

function signalPath(sessionId, name) {
    return path.join(instanceDir(sessionId), name)
}

// File sinyal hidup-mati bot: connected.txt ditulis core saat connection === 'open',
// phone.txt berisi nomor WhatsApp yang benar-benar terhubung.
async function clearSignalFiles(sessionId) {
    for (const name of ['qr.txt', 'pairing.txt', 'connected.txt', 'phone.txt']) {
        await rm(signalPath(sessionId, name), { force: true })
    }
}

async function readSignal(sessionId, name) {
    try {
        const text = (await readFile(signalPath(sessionId, name), 'utf8')).trim()
        return text || null
    } catch {
        return null
    }
}

async function prepareInstance(sessionId) {
    const dir = instanceDir(sessionId)
    await mkdir(dir, { recursive: true })
    await linkCoreEntries(dir)
    await mkdir(path.join(dir, 'sessions'), { recursive: true })
    await mkdir(path.join(dir, 'data'), { recursive: true })
    return dir
}

app.post('/spawn/:sessionId', requireAuth, async (request, reply) => {
    const sessionId = sessionIdOf(request)
    if (!sessionId) {
        return reply.code(400).send({ error: 'INVALID_SESSION_ID' })
    }
    if (!coreExists()) {
        return reply.code(503).send({ error: 'CORE_NOT_FOUND' })
    }

    const body = request.body ?? {}
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: 'userId wajib diisi' })
    }

    const extraEnv = body.env && typeof body.env === 'object' && !Array.isArray(body.env)
        ? body.env
        : {}

    try {
        const dir = await prepareInstance(sessionId)

        // File qr/pairing/connected adalah sinyal ke watcher di mesin ini, jadi pathnya
        // selalu milik Bot Runner (path dari platform bisa menunjuk mesin lain).
        // Sisa file dari percobaan sebelumnya dibuang supaya kode kadaluwarsa tidak terkirim.
        await clearSignalFiles(sessionId)

        // config.json digenerate platform (DB tetap di platform) lalu dikirim utuh ke sini.
        if (typeof body.configJson === 'string' && body.configJson) {
            await writeFile(path.join(dir, 'config.json'), body.configJson, 'utf8')
        }

        await spawnBot(sessionId, {
            SESSION_ID: sessionId,
            USER_ID: userId,
            ...extraEnv,
            // Ditaruh setelah spread supaya nilai dari platform tidak menimpanya.
            QR_OUTPUT_PATH: path.join(dir, 'qr.txt'),
        })
        return { ok: true }
    } catch (error) {
        return internalError(request, reply, error)
    }
})

app.post('/stop/:sessionId', requireAuth, async (request, reply) => {
    const sessionId = sessionIdOf(request)
    if (!sessionId) {
        return reply.code(400).send({ error: 'INVALID_SESSION_ID' })
    }

    try {
        await stopBot(sessionId)
        // Bot berhenti: file sinyal dibuang supaya platform tidak menganggapnya masih terhubung.
        await clearSignalFiles(sessionId)
        return { ok: true }
    } catch (error) {
        return internalError(request, reply, error)
    }
})

app.delete('/destroy/:sessionId', requireAuth, async (request, reply) => {
    const sessionId = sessionIdOf(request)
    if (!sessionId) {
        return reply.code(400).send({ error: 'INVALID_SESSION_ID' })
    }

    try {
        await deleteBot(sessionId)

        const dir = instanceDir(sessionId)
        if (existsSync(dir)) {
            for (const entry of await readdir(dir)) {
                // sessions/ disimpan supaya bot bisa reconnect tanpa scan QR ulang.
                if (entry === 'sessions') continue
                await rm(path.join(dir, entry), { recursive: true, force: true })
            }
        }

        return { ok: true }
    } catch (error) {
        return internalError(request, reply, error)
    }
})

app.get('/status/:sessionId', requireAuth, async (request, reply) => {
    const sessionId = sessionIdOf(request)
    if (!sessionId) {
        return reply.code(400).send({ error: 'INVALID_SESSION_ID' })
    }

    try {
        const status = await statusBot(sessionId)
        const connected = status === 'online' && existsSync(signalPath(sessionId, 'connected.txt'))
        // Nomor asli hanya dikirim kalau bot benar-benar terhubung.
        return {
            status,
            connected,
            phone: connected ? await readSignal(sessionId, 'phone.txt') : null,
        }
    } catch (error) {
        return internalError(request, reply, error)
    }
})

// WS tidak bisa kirim header custom dengan mudah → secret lewat query param.
app.get('/stream/:sessionId', { websocket: true }, (connection, request) => {
    const socket = connection?.socket ?? connection
    const secret = String(request.query?.secret ?? '')

    if (!SECRET || secret !== SECRET) {
        socket.close(1008, 'UNAUTHORIZED')
        return
    }

    const sessionId = sessionIdOf(request)
    if (!sessionId) {
        socket.close(1008, 'INVALID_SESSION_ID')
        return
    }

    let stopWatcher = null

    try {
        stopWatcher = watchSession(
            sessionId,
            (message) => {
                if (socket.readyState === 1) {
                    try {
                        socket.send(JSON.stringify(message))
                    } catch (error) {
                        request.log.error(error)
                    }
                }
                if (message.type === 'connected') {
                    // Kasih waktu client menerima frame terakhir sebelum socket ditutup.
                    setTimeout(() => {
                        try {
                            socket.close(1000, 'CONNECTED')
                        } catch {
                            // socket mungkin sudah tertutup
                        }
                    }, 500)
                }
            },
            () => {
                stopWatcher = null
            },
        )
    } catch (error) {
        request.log.error(error)
        socket.close(1011, 'WATCHER_ERROR')
        return
    }

    socket.on('close', () => {
        if (typeof stopWatcher === 'function') {
            stopWatcher()
            stopWatcher = null
        }
    })
})

// Streaming log PM2 ke platform (mode 'other'). Pesan: {type:'history',lines} / {type:'line',data}.
app.get('/logs/:sessionId', { websocket: true }, (connection, request) => {
    const socket = connection?.socket ?? connection
    const secret = String(request.query?.secret ?? '')

    if (!SECRET || secret !== SECRET) {
        socket.close(1008, 'UNAUTHORIZED')
        return
    }

    const sessionId = sessionIdOf(request)
    if (!sessionId) {
        socket.close(1008, 'INVALID_SESSION_ID')
        return
    }

    const stopWatching = watchSessionLogs(sessionId, (message) => {
        if (socket.readyState !== 1) return
        try {
            socket.send(JSON.stringify(message))
        } catch (error) {
            request.log.error(error)
        }
    })

    socket.on('close', stopWatching)
    socket.on('error', stopWatching)
})

try {
    await connectPm2()
} catch (error) {
    // Tidak fatal: connectPm2 dicoba lagi otomatis saat request pertama.
    app.log.error({ err: error }, 'gagal connect ke PM2 saat startup')
}

await app.listen({ port: PORT, host: '0.0.0.0' })
