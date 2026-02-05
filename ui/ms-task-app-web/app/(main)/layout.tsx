'use client'

import { SignInButton } from '@/app/components/auth'
import { Logo } from '@/app/components/logo/logo'
import { Link, Navbar, NavbarBrand, NavbarContent, NavbarItem } from '@/app/components/ui'

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <Navbar isBordered>
        <NavbarBrand>
          <Logo />
          <p className="font-bold text-inherit">ACME Task Management</p>
        </NavbarBrand>
        <NavbarContent className="hidden gap-4 sm:flex" justify="center">
          <NavbarItem>
            <Link color="foreground" href="/">
              Tasks
            </Link>
          </NavbarItem>
        </NavbarContent>
        <NavbarContent justify="end">
          <NavbarItem>
            <SignInButton />
          </NavbarItem>
        </NavbarContent>
      </Navbar>
      <main className="flex w-full flex-col items-stretch justify-start py-8 sm:items-center sm:py-16">
        {children}
      </main>
    </>
  )
}
