'use client'

import { Geist, Geist_Mono } from 'next/font/google'

import { Alert, Button } from '@/app/components/ui'
import { cn } from '@/lib/ui-helpers'
import { AlertOctagonIcon } from 'lucide-react'
import './globals.css'
import { Providers } from './providers'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    // global-error must include html and body tags
    <html suppressHydrationWarning>
      <body className={cn('h-screen w-full antialiased', geistSans.variable, geistMono.variable)}>
        <Providers className="justify-center">
          <Alert
            color="danger"
            variant="faded"
            className="mx-3 my-auto w-auto grow-0 sm:mx-auto sm:min-w-125"
            classNames={{
              alertIcon: 'fill-transparent',
            }}
            title="Oops, something went wrong!"
            icon={<AlertOctagonIcon />}
            hideIconWrapper
            endContent={
              <Button type="button" color="danger" variant="solid" onPress={() => reset()}>
                Try Again
              </Button>
            }
          />
        </Providers>
      </body>
    </html>
  )
}
