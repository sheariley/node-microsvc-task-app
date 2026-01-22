'use client'

import { Button, type ButtonProps } from '@/app/components/ui'

export type ReloadButtonProps = {
  caption?: string
  color?: ButtonProps['color']
}

export function ReloadButton({ caption = 'Reload', color = 'default' }: ReloadButtonProps) {
  return (
    <Button type="button" color={color} onPress={() => window.location.reload()}>
      {caption}
    </Button>
  )
}
