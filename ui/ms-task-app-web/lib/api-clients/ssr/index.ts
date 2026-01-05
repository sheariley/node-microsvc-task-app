import 'server-only'

import { headers } from 'next/headers'
import { getTaskServiceClient } from '../task-service-client'

export async function getSSRTaskServiceClient() {
  const reqHeaders = (await headers())
        .entries()
        .filter(([key]) => key !== 'content-length' && key !== 'content-type')
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
  return getTaskServiceClient(reqHeaders)
}
