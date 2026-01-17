import mongoose from 'mongoose'
import { wait } from 'ms-task-app-common'

export type MongoDbConnectOptions = {
  host: string
  port: number
  dbName: string
  retries?: number
  delay?: number
  appName: string
  tls?: {
    tlsCAFile: string
    tlsCertificateKeyFile: string
  }
}

export async function connectMongoDbWithRetry({
  host,
  port,
  dbName,
  appName,
  retries = 5,
  delay = 3000,
  tls
}: MongoDbConnectOptions) {
  if (retries <= 0) throw new Error(`Invalid argument value: retries = ${retries}`)
  if (delay <= 0) throw new Error(`Invalid argument value: delay = ${delay}`)

  const uri = `mongodb://${host}:${port}/${dbName}`
  while (retries) {
    // wait for specified delay
    await wait(delay)
    try {
      console.log(`Connecting to MongoDB at ${uri}...`)
      const connection = await mongoose.connect(uri, {
        appName,
        tls: !!tls,
        ...(tls ? tls : {})
      })
      console.log('Connected to MongoDB')
      return { connection, error: null }
    } catch (error) {
      console.error('MongoDB connection error: ', error)
      retries--
      if (retries > 0) {
        console.log('Retrying connection. Retries left: ', retries)
      } else {
        return { connection: null, error }
      }
    }
  }
  return {
    connection: null,
    error: new Error(`Max retries exceeded while connecting to MongoDB at ${uri}!`),
  }
}
