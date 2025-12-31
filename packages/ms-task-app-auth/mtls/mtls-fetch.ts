import fs from 'fs'
import http from 'http'
import https from 'https'

export type CreateMtlsFetcherOptions = Pick<https.AgentOptions, 'key' | 'cert' | 'ca'>
export type CreateMtlsFetcherPathOptions = {
  keyPath: string
  certPath: string
  caPath: string
}

function createMtlsFetcherOptions({
  keyPath,
  certPath,
  caPath,
}: CreateMtlsFetcherPathOptions): CreateMtlsFetcherOptions {
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    ca: fs.readFileSync(caPath),
  }
}

export function createMtlsFetcher(options: CreateMtlsFetcherOptions | CreateMtlsFetcherPathOptions) {
  const { key, cert, ca } = isCreateMtlsFetcherPathOptions(options) ? createMtlsFetcherOptions(options) : options

  async function _fetch(url: string, requestInit: RequestInit) {
    const { body, ...requestOptions } = await requestInitToRequestOptions(requestInit)
    const deferred = Promise.withResolvers<Response>()
    const req = https.request(url, {
      ...requestOptions,
      key,
      cert,
      ca,
    })

    req.on('response', res => deferred.resolve(incomingMessageToResponse(res)))
    req.on('error', error => deferred.reject(error))

    // write body to request stream if provided
    if (body && body.length) {
      try {
        req.write(body)
      } catch (err) {
        deferred.reject(new Error('Failed to write request body to outgoing request stream.', { cause: err }))
        // ensure request is cleaned up
        try { req.destroy() } catch {}
        return deferred.promise
      }
    }

    // send the request
    req.end()

    return deferred.promise
  }

  return {
    fetch: _fetch,
  }
}

export function isCreateMtlsFetcherPathOptions(obj: unknown): obj is CreateMtlsFetcherPathOptions {
  return (
    typeof (obj as any).keyPath === 'string' &&
    typeof (obj as any).certPath === 'string' &&
    typeof (obj as any).caPath === 'string'
  )
}


type MtlsRequestOptions = Omit<https.RequestOptions, 'key' | 'cert' | 'ca'> & {
  /** Optional request body prepared as a Buffer for writing to the socket */
  body?: Buffer
}

async function requestInitToRequestOptions(options: RequestInit): Promise<MtlsRequestOptions> {
  const reqOpts: MtlsRequestOptions = {}

  if (options.method) reqOpts.method = options.method

  // Normalize headers into a plain object
  const headers: Record<string, string> = {}
  if (options.headers instanceof Headers) {
    options.headers.forEach((value, key) => (headers[key.toLowerCase()] = value))
  } else if (Array.isArray(options.headers)) {
    for (const [k, v] of options.headers as Array<[string, string]>) {
      headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
    }
  } else if (options.headers && typeof options.headers === 'object') {
    for (const [k, v] of Object.entries(options.headers as Record<string, string | string[]>)) {
      if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ')
      else if (v !== undefined) headers[k.toLowerCase()] = String(v)
    }
  }

  // Handle body types
  let bodyBuffer: Buffer | undefined
  const b = options.body
  if (b != null) {
    if (typeof b === 'string') {
      bodyBuffer = Buffer.from(b)
    } else if (Buffer.isBuffer(b)) {
      bodyBuffer = b
    } else if (b instanceof URLSearchParams) {
      const s = b.toString()
      bodyBuffer = Buffer.from(s)
      if (!headers['content-type'])
        headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    } else if (b instanceof ArrayBuffer) {
      bodyBuffer = Buffer.from(new Uint8Array(b))
    } else if (ArrayBuffer.isView(b)) {
      bodyBuffer = Buffer.from(new Uint8Array((b as ArrayBufferView).buffer))
    } else if (b instanceof Uint8Array) {
      bodyBuffer = Buffer.from(b)
    } else if (typeof Blob !== 'undefined' && b instanceof Blob) {
      const ab = await b.arrayBuffer()
      bodyBuffer = Buffer.from(new Uint8Array(ab))
      if (!headers['content-type'] && (b as any).type) headers['content-type'] = (b as any).type
    } else if (b instanceof FormData) {
      const { buffer, contentType } = await formDataToBuffer(b)
      bodyBuffer = buffer
      if (!headers['content-type'] && contentType) headers['content-type'] = contentType
    } else if (typeof (b as any).getReader === 'function') {
      // Web ReadableStream
      bodyBuffer = await readableStreamToBuffer(b as ReadableStream<Uint8Array>)
    } else if (typeof (b as any).pipe === 'function') {
      // Node stream
      bodyBuffer = await nodeStreamToBuffer(b as unknown as NodeJS.ReadableStream)
    } else {
      throw new Error('Unknown body type in request options.')
    }
  }

  if (bodyBuffer && !headers['content-length']) {
    headers['content-length'] = String(bodyBuffer.byteLength)
  }

  if (Object.keys(headers).length) reqOpts.headers = headers

  // Forward AbortSignal if provided (Node supports `signal` on request options)
  if ((options as any).signal) reqOpts.signal = (options as any).signal

  // Attach prepared body buffer to the strongly-typed options.
  if (bodyBuffer) reqOpts.body = bodyBuffer

  return reqOpts
}

function incomingMessageToResponse(msg: http.IncomingMessage): Response {
  const headers = new Headers()
  for (const [name, value] of Object.entries(msg.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) headers.set(name, value.join(', '))
    else headers.set(name, String(value))
  }

  const status = msg.statusCode ?? 0
  const statusText = msg.statusMessage ?? ''

  // Convert Node's IncomingMessage (a Node Readable stream) into a
  // Web ReadableStream<Uint8Array> so `Response` accepts it correctly.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      msg.on('data', (chunk: Buffer | string | Uint8Array) => {
        if (typeof chunk === 'string') {
          controller.enqueue(new TextEncoder().encode(chunk))
        } else if (Buffer.isBuffer(chunk)) {
          controller.enqueue(new Uint8Array(chunk))
        } else {
          controller.enqueue(new Uint8Array(chunk))
        }
      })

      msg.on('end', () => controller.close())
      msg.on('error', err => controller.error(err))
    },
    cancel() {
      // If the consumer cancels, destroy the underlying Node stream.
      if (typeof msg.destroy === 'function') msg.destroy()
    },
  })

  return new Response(body, { status, statusText, headers })
}

async function nodeStreamToBuffer(stream: NodeJS.ReadableStream) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', err => reject(err))
  })
}

async function readableStreamToBuffer(rs: ReadableStream<Uint8Array>) {
  const reader = rs.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value))
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c)))
}

async function formDataToBuffer(fd: FormData): Promise<{ buffer: Buffer; contentType?: string }> {
  // Build multipart/form-data body. This supports string fields and Blob/File-like values
  const boundary = '----formboundary' + Math.random().toString(16).slice(2)
  const parts: Buffer[] = []

  const append = (s: string) => parts.push(Buffer.from(s))
  const formDataMap = new Map<string, FormDataEntryValue>()
  fd.forEach((value, key) => formDataMap.set(key, value))

  for (const [name, value] of formDataMap) {
    if (value === null) continue

    append(`--${boundary}\r\n`)
    // Blob/File-like
    if (isFileLike(value)) {
      const filename = value.name || 'blob'
      const type = value.type || 'application/octet-stream'
      append(
        `Content-Disposition: form-data; name="${escapeFormName(name)}"; filename="${escapeFormName(filename)}"\r\n`
      )
      append(`Content-Type: ${type}\r\n\r\n`)
      const ab: ArrayBuffer = await value.arrayBuffer()
      parts.push(Buffer.from(new Uint8Array(ab)))
      append('\r\n')
    } else {
      // Fallback to string
      append(`Content-Disposition: form-data; name="${escapeFormName(name)}"\r\n\r\n`)
      append(String(value) + '\r\n')
    }
  }

  append(`--${boundary}--\r\n`)

  return { buffer: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

function escapeFormName(s: string) {
  return s.replace(/"/g, '%22')
}

type FileLike = {
  arrayBuffer: () => Promise<ArrayBuffer>
  name: string
  type: string
}

function isFileLike(obj: unknown): obj is FileLike {
  return (
    typeof (obj as any).arrayBuffer === 'function' &&
    typeof (obj as any).name === 'string' &&
    typeof (obj as any).type === 'string'
  )
}
