import amqp from 'amqplib'
import { wait } from 'ms-task-app-common'

export type MqConnectOptions = {
  host: string
  port: number
  retries?: number
  delay?: number
  initialDelay?: number
}

export async function connectMQWithRetry({
  host,
  port,
  retries = 5,
  delay = 3000,
  initialDelay = 7000,
}: MqConnectOptions) {
  if (retries <= 0) throw new Error(`Invalid argument value: retries = ${retries}`)
  if (delay <= 0) throw new Error(`Invalid argument value: delay = ${delay}`)

  if (initialDelay) {
    console.log('Waiting for MQ server to start...')
    // give the MQ server time to start
    await wait(initialDelay)
  }

  const uri = `amqp://${host}:${port}`
  while (retries) {
    // wait for specified delay
    await wait(delay)
    try {
      console.log(`Connecting to RabbitMQ at ${uri}...`)
      const mqConnection = await amqp.connect(uri)
      console.log('Connected to RabbitMQ server. Opening channel...')
      const mqChannel = await mqConnection.createChannel()
      console.log('RabbitMQ connected and channel opened.')
      return { mqConnection, mqChannel, error: null }
    } catch (error) {
      console.log('RabbitMQ Connection Error: ', error)
      retries--
      if (retries > 0) {
        console.log('Retrying connection. Retries left: ', retries)
      } else {
        return { mqConnection: null, mqChannel: null, error }
      }
    }
  }
}
