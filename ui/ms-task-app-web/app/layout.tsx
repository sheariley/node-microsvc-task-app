import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'
import { Providers } from './providers'
import { cn } from '@/lib/ui-helpers'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Microservices Task App',
  description: 'A microservice-based app to manage your tasks',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
      <body className={cn('flex flex-col min-h-screen w-full items-stretch justify-start antialiased', geistSans.variable, geistMono.variable)}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
