import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '../service/univer-service.ts'
import { createUniverRouter } from './router.ts'

/** Services required by the browser API consumer. */
export const inject = ['univer', 'webServer', 'sessions']
export const name = 'univer-web'

/** Register the browser API as one host webserver prefix route. */
export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/univer-api',
        handler: createUniverRouter(ctx.univer, ctx.sessions)
      }),
    'univer: browser api'
  )
}
