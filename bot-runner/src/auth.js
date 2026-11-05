// Validasi shared secret dari header Authorization: Bearer <secret>
export function authMiddleware(secret) {
    return async function (request, reply) {
        const header = request.headers.authorization ?? ''
        const token = header.startsWith('Bearer ') ? header.slice(7) : ''
        if (!secret || token !== secret) {
            return reply.code(401).send({ error: 'UNAUTHORIZED' })
        }
    }
}
