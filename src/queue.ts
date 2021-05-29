import amqp from "amqplib"
import { Rabbit } from "./rabbit"
import { QueueConfig, Handler, ReceivedMessage, MsgOptions } from "./types"
import { prepareMessage } from "./utils"

/** Generates a handler chain for subscriber messages
 *
 *  @param handler - The list of handlers to chain together
 *  @returns The chained handler with the same signature as handler
 */
const makeChain = <T>(handlers: Handler<T>[]): Handler<T> =>
  handlers.reduce((chain, hdl) =>
    (msg, next) => chain(msg, (success?: boolean|Error) => {
      if (success === false) return next(false)
      if (success instanceof Error) return next(success)
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
      if (success === true) return this.client.channel("__read__").ack(msg)
      else return this.client.channel("__read__").nack(msg, false, !this.config.deadLetterExchange)
    }
  }

  /** Stops the subsription to messages for that queue */
  async cancel() {
    if (!this.consumerTag) return
    await this.client.channel("__read__").cancel(this.consumerTag)
    this.consumerTag = null
  }

  /** Sends a message directly on a queue
   *
   *  @param message - The message to send. If it is an object, and no
   *  options.contentType is set, the message will be stringified in json, using
   *  {@link https://npmjs.org/fast-safe-stringify fast-safe-stringify} and the
   *  content-type will be set to `application/json`, so that the consumer will
   *  be able to parse it properly
   *  If the message is a buffer, no content-type will be set
   *  @param options - Some options
   */
  async send(message: Object|Buffer, options: MsgOptions = {}) {
    this.client.channel("__read__").sendToQueue(this.name, ...prepareMessage(message, options))
  }

  /** Subscribe to messages on that queue */
  async sub<T>(...hdl: Handler<T>[]) {
    if (!!this.consumerTag) throw new Error("A consumer already exists for that queue in that context")
    const chain = makeChain(hdl)

    this.consumerTag = await this.client.channel("__read__").consume(this.name, async msg => {
      // istanbul ignore if - don't know how to have it null
      if (!msg) return
      const message: ReceivedMessage<T> = {
        content: msg.content as any,
        ...msg.fields,
        ...msg.properties
      }
      if (message.contentType === "application/json")
        message.content = JSON.parse(message.content.toString())
      const ack = this.makeAck(msg)
      try {
        await chain(message, ack)
        ack()
      } catch { ack(false) }
    }).then(ct => ct.consumerTag)
  }
}