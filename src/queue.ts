import amqp from "amqplib"
import { Rabbit } from "./rabbit"
import { QueueConfig, Handler, ReceivedMessage } from "./types"

/** Generates a handler chain for subscriber messages
 *
 *  @param handler - The list of handlers to chain together
 *  @returns The chained handler with the same signature as handler
 */
const makeChain = (handlers: Handler[]): Handler =>
  handlers.reduce((chain, hdl) =>
    (msg, next) => chain(msg, (success?: boolean) => {
      if (success === false) return next(false)
      if (success === true) next(true)
      return hdl(msg, next)
    })
  , (msg, next) => next())

/** Represents a rabbit mq queue */
export class Queue {
  /** Whether the queue was asserted */
  private asserted = false
  /** If the queue has a consumer, here is its consumer tag */
  private consumerTag: string|null = null

  /** Creates the queue
   *
   *  @param client - The rabbit client
   *  @param name - The queue name
   *  @param config - Some configuration
   */
  constructor(private client: Rabbit, readonly name: string, private config: QueueConfig = {}) {}

  /** Asserts the queue into existence */
  async assert(): Promise<Queue> {
    if (this.asserted) return this
    const channel = await this.client.channel("__read__").connect()
    await channel.assertQueue(this.name, this.config)
    channel.prefetch(1)
    this.asserted = true
    return this
  }

  /** Generates the ack method for one message, so that it is safe to call multiple times
   *
   *  @param message - The message to generate the ack method for
   */
  private makeAck(msg: amqp.ConsumeMessage) {
    let called = false
    return (success = true) => {
      if (called) return
      called = true
      if (success) return this.client.channel("__read__").ack(msg)
      else return this.client.channel("__read__").nack(msg, false, !this.config.deadLetterExchange)
    }
  }

  /** Stops the subsription to messages for that queue */
  async cancel() {
    if (!this.consumerTag) return
    await this.client.channel("__read__").cancel(this.consumerTag)
    this.consumerTag = null
  }

  /** Subscribe to messages on that queue */
  async sub(...hdl: Handler[]) {
    if (!!this.consumerTag) throw new Error("A consumer already exists for that queue in that context")
    const chain = makeChain(hdl)

    this.consumerTag = await this.client.channel("__read__").consume(this.name, async msg => {
      if (!msg) return
      const message: ReceivedMessage = {
        content: msg.content,
        ...msg.properties
      }
      if (message.contentType === "application/json")
        message.content = JSON.parse(message.content.toString())
      const ack = this.makeAck(msg)
      try {
        await chain(message, ack)
        ack(true)
      } catch { ack(false) }
    }).then(ct => ct.consumerTag)
  }
}