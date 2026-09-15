import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '../service/univer-service.ts'
import { createUniverRouter } from './router.ts'
import { createViewerProxy, type ConnectionTrust } from './viewer-proxy.ts'

/** Services required by the browser API consumer. */
export const inject = ['univer', 'webServer', 'sessions', 'connection']
export const name = 'univer-web'

/** Register the browser API and the same-origin Viewer proxy behind the connection trust fence. */
export function apply(ctx: Context): void {
  const connection = Reflect.get(ctx, 'connection') as ConnectionTrust
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/univer-api',
        handler: createUniverRouter(ctx.univer, ctx.sessions, connection)
      }),
    'univer: browser api'
  )
  ctx.effect(() => {
    const proxy = createViewerProxy({
      gatewayOrigin: async () => {
        const started = await ctx.univer.ensureGateway()
        if (!started.ok) throw new Error(started.reason)
        return started.gateway
      },
      sessions: ctx.sessions,
      connection
    })
    const disposers = [
      ctx.webServer.register({
        kind: 'prefix',
        path: '/univer-viewer',
        handler: proxy.httpHandler
      }),
      ctx.webServer.register({ kind: 'prefix', path: '/uf', handler: proxy.httpHandler }),
      ctx.webServer.registerUpgrade({ path: '/univer-viewer/ws', handler: proxy.upgradeHandler })
    ]
    return () => {
      proxy.dispose()
      for (const dispose of disposers) dispose()
    }
  }, 'univer: same-origin viewer proxy')
}
