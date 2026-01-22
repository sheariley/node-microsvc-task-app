import 'client-only'

import pino from 'pino'

const logApiUrl = process.env.PUBLIC_CLIENT_LOG_API_URL || 'http://localhost:3000/api/log'

const clientLogger = pino({
  browser: {
    asObject: true,
    transmit: {
      level: 'info',
      send: (level, logEvent) => {
        const data = logEvent.messages

        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
          type: 'application/json',
        }
        const blob = new Blob([JSON.stringify({ data, level })], headers)
        navigator.sendBeacon(logApiUrl, blob)
      },
    },
  },
})

export default clientLogger
