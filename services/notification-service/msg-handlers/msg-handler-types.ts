export type MessagerHandler<TPayload = any> = (payload: TPayload) => Promise<void>
