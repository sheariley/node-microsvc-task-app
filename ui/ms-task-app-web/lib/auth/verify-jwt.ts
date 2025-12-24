import { jwtVerify, JWTPayload } from 'jose'

export async function verifyJwtFromBearer(bearer: string) {
  if (!bearer || !bearer.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header')
  }

  const token = bearer.slice(7)
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is not set')
  }

  const key = new TextEncoder().encode(secret)

  const { payload } = await jwtVerify(token, key)
  return payload as JWTPayload
}

export type JwtPayload = JWTPayload
