'use client'

import { openobserveLogs } from '@openobserve/browser-logs'
import { openobserveRum } from '@openobserve/browser-rum'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import React from 'react'

export function RumProvider() {
  const { data: session } = useSession()
  const pathname = usePathname()

  React.useEffect(() => {
    const rumOptions = {
      clientToken: process.env.NEXT_PUBLIC_RUM_TOKEN!,
      site: process.env.NEXT_PUBLIC_RUM_ENDPOINT,
      env: process.env.NEXT_PUBLIC_ENV ?? 'production',
      applicationId: 'ms-task-app-web',
      service: 'web-ui',
      version: '0.1.0',
      organizationIdentifier: 'default',
      insecureHTTP: true,
      apiVersion: 'v1',
    }

    openobserveRum.init({
      trackResources: true,
      trackLongTasks: true,
      trackUserInteractions: true,
      sessionReplaySampleRate: 100,
      applicationId: rumOptions.applicationId,
      clientToken: rumOptions.clientToken,
      site: rumOptions.site,
      organizationIdentifier: rumOptions.organizationIdentifier,
      service: rumOptions.service,
      env: rumOptions.env,
      version: rumOptions.version,
      apiVersion: rumOptions.apiVersion,
      insecureHTTP: rumOptions.insecureHTTP,
      defaultPrivacyLevel: 'mask-user-input',
    })

    openobserveLogs.init({
      clientToken: rumOptions.clientToken,
      site: rumOptions.site,
      organizationIdentifier: rumOptions.organizationIdentifier,
      service: rumOptions.service,
      env: rumOptions.env,
      version: rumOptions.version,
      forwardErrorsToLogs: true,
      insecureHTTP: rumOptions.insecureHTTP,
      apiVersion: rumOptions.apiVersion,
    })

    openobserveRum.startSessionReplayRecording({ force: process.env.NEXT_PUBLIC_ENV === 'development' })
  }, [])

  // Setup view tracking
  React.useEffect(() => {
    openobserveRum.setViewName(pathname)
  }, [pathname])

  // Setup user tracking
  React.useEffect(() => {
    if (!session?.user) {
      openobserveRum.clearUser()
    } else {
      openobserveRum.setUser({
        id: session.user.id!,
        name: session.user.name!,
        email: session.user.email!,
      })
    }
  }, [session])

  return <></>
}
