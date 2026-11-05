import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { instanceDir } from './pm2.js'

const POLL_MS = 2000

// Baca file kalau ada; null kalau belum ada / kosong / gagal dibaca.
async function readIfExists(file) {
    try {
        const text = await readFile(file, 'utf8')
        const value = text.trim()
        return value ? value : null
    } catch {
        return null
    }
}

export function watchSession(sessionId, onMessage, onStop) {
    const dir = instanceDir(sessionId)
    let lastQr = null
    let lastPairing = null
    let stopped = false
    let timer = null

    function stop() {
        if (stopped) return
        stopped = true
        if (timer) {
            clearInterval(timer)
            timer = null
        }
        if (typeof onStop === 'function') {
            try {
                onStop()
            } catch {
                // callback stop tidak boleh menjatuhkan watcher
            }
        }
    }

    async function tick() {
        if (stopped) return

        const qr = await readIfExists(path.join(dir, 'qr.txt'))
        if (qr && qr !== lastQr) {
            lastQr = qr
            onMessage({ type: 'qr', data: qr })
        }

        const pairing = await readIfExists(path.join(dir, 'pairing.txt'))
        if (pairing && pairing !== lastPairing) {
            lastPairing = pairing
            onMessage({ type: 'pairing', data: pairing })
        }

        const connected = await readIfExists(path.join(dir, 'connected.txt'))
        if (connected) {
            onMessage({ type: 'connected' })
            stop()
        }
    }

    timer = setInterval(() => {
        void tick()
    }, POLL_MS)

    return stop
}
