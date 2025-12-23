'use client'

import { Button } from '@heroui/react'
import { signIn, signOut, useSession } from 'next-auth/react'

//import { initiateSignIn, initiateSignOut } from '@/server-actions/auth'

export function SignInButton() {
  const { data: session } = useSession()

  if (!session?.user) {
    return (
      <form
        action={() => signIn()}
      >
        <Button type="submit" color="primary" variant="flat">
          Sign In/Up
        </Button>
      </form>
    )
  }

  return (
    <form
      action={() => signOut()}
    >
      <Button type="submit" color="primary" variant="flat">
        Sign Out
      </Button>
    </form>
  )
}
