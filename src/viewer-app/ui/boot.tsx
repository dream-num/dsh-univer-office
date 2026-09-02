import { Folder, TriangleAlert } from 'lucide-react'
import type { ReactElement } from 'react'
import { cn } from '../lib/utils'

const CODE_CLASS =
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]'

interface BootCardProps {
  tone?: 'neutral' | 'warn'
  title: string
  /** Trusted i18n HTML (contains <code> snippets). */
  body: string
  pre: string
  /** Trusted i18n HTML (contains <code> snippets). */
  hint: string
}

/** Full-page boot guidance (no ?file in the URL, or the univerfile does not exist). */
export function BootCard({
  tone = 'neutral',
  title,
  body,
  pre,
  hint
}: BootCardProps): ReactElement {
  const warn = tone === 'warn'
  return (
    <div className="flex h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
        <div
          className={cn(
            'mb-4 flex size-10 items-center justify-center rounded-lg [&_svg]:size-5',
            warn ? 'bg-amber-50 text-amber-600' : 'bg-muted text-muted-foreground'
          )}
        >
          {warn ? <TriangleAlert /> : <Folder />}
        </div>
        <h1 className="text-base font-semibold">{title}</h1>
        <p
          className={cn('mt-2 text-sm leading-relaxed text-muted-foreground', CODE_CLASS)}
          dangerouslySetInnerHTML={{ __html: body }}
        />
        <pre className="mt-3 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[13px]">
          {pre}
        </pre>
        <p
          className={cn('mt-3 text-xs leading-relaxed text-muted-foreground/70', CODE_CLASS)}
          dangerouslySetInnerHTML={{ __html: hint }}
        />
      </div>
    </div>
  )
}

/** Inline fatal banner appended under whatever is already on screen. */
export function FatalNotice({ text }: { text: string }): ReactElement {
  return (
    <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {text}
    </div>
  )
}
