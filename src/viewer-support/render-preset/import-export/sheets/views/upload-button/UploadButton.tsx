import type { MouseEvent, ReactNode } from 'react'
import { Button, clsx } from '@univerjs/design'

export interface IUploadButton {
  children?: ReactNode
  className?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
}

export function UploadButton(props: IUploadButton) {
  const { onClick, children, className } = props

  return (
    <Button
      size="small"
      variant="text"
      className={clsx('univer-text-primary-600', className)}
      type="button"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
