'use client'

import { Link, Navbar, NavbarBrand, NavbarContent, NavbarItem } from '@heroui/react'
import { SignInButton } from '../components/auth'
import { Logo } from '../components/logo/logo'

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
            <Link color="foreground" href="#">
              Tasks
            </Link>
          </NavbarItem>
        </NavbarContent>
        <NavbarContent justify="end">
          <NavbarItem className="hidden lg:flex">
            <SignInButton />
          </NavbarItem>
        </NavbarContent>
      </Navbar>
      <main className="flex flex-col items-stretch justify-start py-8 sm:items-center sm:py-16">
        {children}
      </main>
    </>
  )
}
