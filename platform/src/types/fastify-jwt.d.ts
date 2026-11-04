import '@fastify/jwt';
import type { AuthUser, JWTPayload } from './auth';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: AuthUser;
  }
}
