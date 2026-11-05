import path from 'node:path'
import pm2 from 'pm2'

let connectPromise = null

export function rexifyRoot() {
    const root = process.env.REXIFY_ROOT
    if (!root) throw new Error('REXIFY_ROOT wajib di-set')
    return root
}

export function instanceDir(sessionId) {
    return path.join(rexifyRoot(), 'instances', sessionId)
}

export function pm2Name(sessionId) {
    return `rexify-${sessionId}`
}

export function connectPm2() {
    if (!connectPromise) {
        connectPromise = new Promise((resolve, reject) => {
            pm2.connect((err) => {
                if (err) {
                    connectPromise = null
                    reject(err)
                    return
                }
                resolve()
            })
        })
    }
    return connectPromise
}

function statusOf(name) {
    return new Promise((resolve, reject) => {
        pm2.describe(name, (err, list) => {
            if (err) {
                reject(err)
                return
            }
            const proc = Array.isArray(list) ? list[0] : null
            resolve(proc ? String(proc.pm2_env?.status ?? 'unknown') : null)
        })
    })
}

function deleteByName(name) {
    return new Promise((resolve, reject) => {
        pm2.delete(name, (err) => (err ? reject(err) : resolve()))
    })
}

export async function statusBot(sessionId) {
    await connectPm2()
    return statusOf(pm2Name(sessionId))
}

export async function spawnBot(sessionId, env = {}) {
    const dir = instanceDir(sessionId)
    const name = pm2Name(sessionId)

    await connectPm2()

    // Spawn ulang harus bersih: proses lama dengan nama sama dihapus dulu.
    if (await statusOf(name)) {
        await deleteByName(name)
    }

    await new Promise((resolve, reject) => {
        pm2.start(
            {
                name,
                script: path.join(dir, 'index.js'),
                cwd: dir,
                interpreter: 'node',
                env,
            },
            (err) => (err ? reject(err) : resolve()),
        )
    })
}

export async function stopBot(sessionId) {
    const name = pm2Name(sessionId)
    await connectPm2()

    if (!(await statusOf(name))) return

    await new Promise((resolve, reject) => {
        pm2.stop(name, (err) => (err ? reject(err) : resolve()))
    })
}

export async function deleteBot(sessionId) {
    const name = pm2Name(sessionId)
    await connectPm2()

    if (!(await statusOf(name))) return

    await deleteByName(name)
}
