// Streaming log PM2 satu session ke WebSocket.
// Dipakai endpoint GET /logs/:sessionId; platform mem-proxy-nya di mode 'other'.

import { existsSync } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { pm2Name } from './pm2.js'

const POLL_MS = 1000
const TAIL_LINES = 100
// Batas baca awal supaya file log raksasa tidak dibaca utuh.
const TAIL_BYTES = 64 * 1024

// Baris PM2 diawali "YYYY-MM-DD HH:MM:SS"; baris error diberi prefix "[ERR] ".
const LINE_TIME_RE = /^(?:\[ERR\]\s*)?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)/

function lineTime(line) {
    const match = LINE_TIME_RE.exec(line)
    if (!match) return null
    const parsed = Date.parse(match[1].replace(' ', 'T').replace(',', '.'))
    return Number.isNaN(parsed) ? null : parsed
}

/**
 * Gabungkan baris out.log dan error.log berdasarkan timestamp.
 * Tanpa ini, 100 baris error lama selalu ditempel di bawah 100 baris out terbaru
 * setiap panel console dibuka ulang. Baris tanpa timestamp ditaruh di akhir dengan
 * urutan aslinya supaya tidak hilang.
 */
export function mergeChronological(outLines, errLines) {
    const tagged = [
        ...outLines.map((line, index) => ({ line, index, time: lineTime(line) })),
        ...errLines.map((line, index) => ({
            line,
            index: outLines.length + index,
            time: lineTime(line),
        })),
    ]

    tagged.sort((a, b) => {
        if (a.time === null && b.time === null) return a.index - b.index
        if (a.time === null) return 1
        if (b.time === null) return -1
        return a.time - b.time || a.index - b.index
    })

    return tagged.map((item) => item.line)
}

// PM2 menyimpan log di $PM2_HOME/logs (default ~/.pm2/logs).
function logsDir() {
    const home = process.env.PM2_HOME ?? path.join(process.env.HOME ?? '/root', '.pm2')
    return path.join(home, 'logs')
}

function logPath(sessionId, kind) {
    return path.join(logsDir(), `${pm2Name(sessionId)}-${kind}.log`)
}

// Pembaca incremental: simpan offset byte + sisa baris yang belum lengkap.
class LogTailer {
    constructor(file, prefix = '') {
        this.file = file
        this.prefix = prefix
        this.offset = 0
        this.rest = ''
    }

    decorate(line) {
        return this.prefix ? `${this.prefix}${line}` : line
    }

    async history(count) {
        if (!existsSync(this.file)) return []

        const handle = await open(this.file, 'r')
        try {
            const { size } = await handle.stat()
            const start = Math.max(0, size - TAIL_BYTES)
            const length = size - start
            const buffer = Buffer.alloc(length)
            if (length > 0) await handle.read(buffer, 0, length, start)

            // Polling lanjut dari akhir file supaya baris lama tidak dikirim dua kali.
            this.offset = size

            const lines = buffer.toString('utf8').split('\n')
            if (start > 0) lines.shift() // baris pertama bisa terpotong

            return lines
                .filter((line) => line.length > 0)
                .slice(-count)
                .map((line) => this.decorate(line))
        } finally {
            await handle.close()
        }
    }

    async readNew() {
        if (!existsSync(this.file)) return []

        const handle = await open(this.file, 'r')
        try {
            const { size } = await handle.stat()

            // File dirotasi / dikosongkan (pm2 flush): mulai lagi dari awal.
            if (size < this.offset) {
                this.offset = 0
                this.rest = ''
            }
            if (size === this.offset) return []

            const length = size - this.offset
            const buffer = Buffer.alloc(length)
            await handle.read(buffer, 0, length, this.offset)
            this.offset = size

            const parts = (this.rest + buffer.toString('utf8')).split('\n')
            this.rest = parts.pop() ?? '' // sisa baris belum lengkap

            return parts.filter((line) => line.length > 0).map((line) => this.decorate(line))
        } finally {
            await handle.close()
        }
    }
}

// Kirim history lalu baris baru tiap detik. Return fungsi stop untuk dipanggil saat socket tutup.
export function watchSessionLogs(sessionId, send) {
    const out = new LogTailer(logPath(sessionId, 'out'))
    const err = new LogTailer(logPath(sessionId, 'error'), '[ERR] ')
    let stopped = false
    let busy = false
    let timer = null

    async function sendHistory() {
        const lines = mergeChronological(await out.history(TAIL_LINES), await err.history(TAIL_LINES))
        send({ type: 'history', lines })
    }

    void sendHistory()

    timer = setInterval(() => {
        void (async () => {
            if (stopped || busy) return
            busy = true
            try {
                const lines = mergeChronological(await out.readNew(), await err.readNew())
                for (const line of lines) send({ type: 'line', data: line })
            } catch {
                // Gagal baca sesaat: coba lagi tick berikutnya.
            } finally {
                busy = false
            }
        })()
    }, POLL_MS)

    return function stop() {
        if (stopped) return
        stopped = true
        if (timer) {
            clearInterval(timer)
            timer = null
        }
    }
}
