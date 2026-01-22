export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

import logger from '@/lib/logging/server-logger'

const handler = async (req: NextRequest) => {
  let jsonBody = ''
  if (req.body && req.body instanceof ReadableStream) {
    try {
      const reader = req.body.getReader()
      const decoder = new TextDecoder()
      let readResult = await reader.read()
      while (!readResult.done) {
        jsonBody += decoder.decode(readResult.value, { stream: true })
        readResult = await reader.read()
      }
      try {
        const { data, level = 'info' } = JSON.parse(jsonBody) as { data: unknown[]; level: string }
        let logData: object = { client: true }
        if (typeof data[0] === 'object') {
          logData = {
            ...logData,
            ...data[0]
          }
        } else {
          logData = {
            ...logData,
            msg: `${data[0]}`
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(logger as any)[level](logData, ...data.slice(1))
        return NextResponse.json({ error: false }, { status: 200 })
      } catch (parseError) {
        logger.error(parseError, 'Failed to parse log message from client log request.')
        return NextResponse.json({ error: true }, { status: 500 })
      }
    } catch (readError) {
      logger.error(readError, 'Failed to read log message from client log request.')
      return NextResponse.json({ error: true }, { status: 500 })
    }
  }
}

export { handler as POST }
