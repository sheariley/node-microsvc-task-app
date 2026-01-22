export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node')
    await import('pino')
    // @ts-expect-error next-logger does not provide typings
    await import('next-logger')
  }
}
