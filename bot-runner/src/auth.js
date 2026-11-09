import { timingSafeEqual } from 'node:crypto'

// Perbandingan constant-time: panjang harus sama dulu, kalau beda timingSafeEqual melempar.
export function safeEqual(a, b) {
    const left = Buffer.from(String(a ?? ''))
    const right = Buffer.from(String(b ?? ''))
    return left.length === right.length && timingSafeEqual(left, right)
}

// Validasi shared secret dari header Authorization: Bearer <secret>
export function authMiddleware(secret) {
    return async function (request, reply) {
        const header = request.headers.authorization ?? ''
        const token = header.startsWith('Bearer ') ? header.slice(7) : ''
        if (!secret || !safeEqual(token, secret)) {
            return reply.code(401).send({ error: 'UNAUTHORIZED' })
        }
    }
}
