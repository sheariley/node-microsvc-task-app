'use client'

import { useRouter } from 'next/navigation'
import { HeroUIProvider, HeroUIProviderProps, ToastProvider } from '@/app/components/ui'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { SessionProvider } from 'next-auth/react'
import React from 'react'
import { cn } from '@/lib/ui-helpers'

declare module '@react-types/shared' {
  interface RouterConfig {
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>['push']>[1]>
  }
}

export type ProvidersProps = Omit<HeroUIProviderProps, 'navigate'>

export function Providers({ children, className, ...props }: ProvidersProps) {
  const router = useRouter()

  return (
    <SessionProvider>
      <NextThemesProvider attribute="class">
        <HeroUIProvider
          navigate={router.push}
          {...props}
          className={cn(
            'm-0 flex h-full w-full flex-col items-stretch justify-start sm:items-center',
            className
          )}
        >
          <ToastProvider />
          {children}
        </HeroUIProvider>
      </NextThemesProvider>
    </SessionProvider>
  )
}
