'use client'

import { HeroUIProvider, HeroUIProviderProps, ToastProvider } from '@/app/components/ui'
import { RumProvider } from '@/lib/analytics'
import { cn } from '@/lib/ui-helpers'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { useRouter } from 'next/navigation'

// declare module '@react-types/shared' {
//   interface RouterConfig {
//     routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>['push']>[1]>
//   }
// }

export type ProvidersProps = Omit<HeroUIProviderProps, 'navigate'>

export function Providers({ children, className, ...props }: ProvidersProps) {
  const router = useRouter()

  return (
    <SessionProvider>
      <RumProvider />
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
