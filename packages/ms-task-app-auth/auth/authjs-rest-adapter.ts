import type {
  AdapterAccount,
  AdapterUser,
  Adapter,
  AdapterSession,
  VerificationToken,
} from '@auth/core/adapters'
import { mapDtoValidationErrors, SessionInputDtoSchema } from 'ms-task-app-dto'
import { createMtlsFetcher, type CreateMtlsFetcherPathOptions } from 'ms-task-app-mtls'

export type RestAdapterOptions = {
  baseUrl: string,
  mtlsFetcherOptions?: CreateMtlsFetcherPathOptions
}

export function RestAdapter({ baseUrl, mtlsFetcherOptions }: RestAdapterOptions): Adapter {
  let _fetch: (url: string, requestInit: RequestInit) => Promise<Response> = fetch
  if (mtlsFetcherOptions) {
    const mtlsFetcher = createMtlsFetcher(mtlsFetcherOptions)
    _fetch = mtlsFetcher.fetch
  }
  
  return {
    async createUser(data) {
      const url = `${baseUrl}/users`
      const body = JSON.stringify(data)
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      })

      if (!res.ok) {
        throw new Error('Failed to create user', { cause: res })
      }

      const result = (await res.json()) as AdapterUser
      return result
    },
    async getUser(id) {
      const url = `${baseUrl}/users/${id}`
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        // if not found, return null
        if (res.status === 404) {
          return null
        }

        throw new Error(`Failed to get user by ID ${id}`, { cause: res })
      }

      const result = (await res.json()) as AdapterUser
      return result
    },
    async getUserByEmail(email) {
      const url = `${baseUrl}/users/by-email/${encodeURIComponent(email)}`
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        // if not found, return null
        if (res.status === 404) {
          return null
        }

        throw new Error(`Failed to get user by email ${email}`, { cause: res })
      }

      const result = (await res.json()) as AdapterUser
      return result
    },
    async getUserByAccount(provider_providerAccountId) {
      const { provider, providerAccountId } = provider_providerAccountId
      const url = `${baseUrl}/providers/${encodeURIComponent(provider)}/accounts/${providerAccountId}/user`
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        // if not found, return null
        if (res.status === 404) {
          return null
        }

        throw new Error('Failed to get user by account', { cause: res })
      }

      const result = (await res.json()) as AdapterUser
      return result
    },
    async updateUser(data) {
      const { id, ...user } = data
      const url = `${baseUrl}/users/${id}`
      const body = JSON.stringify(user)
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      })

      if (!res.ok) {
        throw new Error('Failed to update user', { cause: res })
      }

      const result = (await res.json()) as AdapterUser
      return result
    },
    async deleteUser(id) {
      const url = `${baseUrl}/users/${id}`
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`Failed to delete user by ID ${id}`, { cause: res })
      }

      const result = (await res.json()) as AdapterUser
      return result
    },
    async linkAccount(account) {
      const { provider, ...data } = account
      const url = `${baseUrl}/providers/${encodeURIComponent(provider)}/accounts/link`
      const body = JSON.stringify(data)
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      })

      if (!res.ok) {
        throw new Error('Failed to link account', { cause: res })
      }

      const result = (await res.json()) as AdapterAccount
      return result
    },
    async unlinkAccount(provider_providerAccountId) {
      const { provider, providerAccountId } = provider_providerAccountId
      const url = `${baseUrl}/providers/${encodeURIComponent(provider)}/accounts/${providerAccountId}/unlink`
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`Failed to unlink account`, { cause: res })
      }

      const result = (await res.json()) as AdapterAccount
      return result
    },
    async getSessionAndUser(sessionToken) {
      const url = `${baseUrl}/sessions/${encodeURIComponent(sessionToken)}/with-user`
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        // if not found, return null
        if (res.status === 404) {
          return null
        }

        throw new Error(`Failed to get session and user by token ${sessionToken}`, { cause: res })
      }

      const result = (await res.json()) as { user: AdapterUser; session: AdapterSession }
      return result
    },
    async createSession(data) {
      const url = `${baseUrl}/sessions`
      const body = JSON.stringify(data)
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      })

      if (!res.ok) {
        throw new Error('Failed to create session', { cause: res })
      }
      const resBody = await res.json()

      const valResult = await SessionInputDtoSchema.safeParseAsync(resBody)

      if (!valResult.success) {
        const errorDetail = {
          resBody,
          validationErrors: mapDtoValidationErrors(valResult.error),
        }
        console.error(
          'Invalid response body recieved from OAuth Rest API for createSession.',
          errorDetail
        )
        throw new Error('Invalid response body recieved from OAuth Rest API for createSession.', {
          cause: errorDetail,
        })
      }

      return valResult.data
    },
    async updateSession(session) {
      const { sessionToken } = session
      const url = `${baseUrl}/sessions/${sessionToken}`
      const body = JSON.stringify(session)
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      })

      if (!res.ok) {
        throw new Error('Failed to update session', { cause: res })
      }

      const result = (await res.json()) as AdapterSession
      return result
    },
    async deleteSession(sessionToken) {
      const url = `${baseUrl}/sessions/${sessionToken}`
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`Failed to delete session by token ${sessionToken}`, { cause: res })
      }

      const result = (await res.json()) as AdapterSession
      return result
    },
    async createVerificationToken(data) {
      const url = `${baseUrl}/verification-tokens`
      const body = JSON.stringify(data)
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      })

      if (!res.ok) {
        throw new Error('Failed to create verification token', { cause: res })
      }

      const result = (await res.json()) as VerificationToken
      return result
    },
    async useVerificationToken(identifier_token) {
      const { identifier, token } = identifier_token
      const url = `${baseUrl}/verification-tokens/${encodeURIComponent(identifier)}/use/${encodeURIComponent(token)}`
      const res = await _fetch(url, {
        cache: 'no-cache',
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`Failed to use verification token ${identifier}`, { cause: res })
      }

      const result = (await res.json()) as VerificationToken
      return result
    },
  }
}
