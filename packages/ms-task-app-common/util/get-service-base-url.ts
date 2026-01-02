export type ServiceUrlParams = {
  host: string
  port: number
  secure?: boolean
}

export function getServiceBaseUrl({ host, port, secure }: ServiceUrlParams) {
  const proto = secure ? 'https' : 'http'
  return `${proto}://${host}:${port}`
}
