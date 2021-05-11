import { Rabbit } from "./rabbit"
import { ExchangeConfig, MsgOptions } from "./types"
import { Queue } from "./queue"
import { prepareMessage } from "./utils"

export class Exchange {
  /** Whether the exchange was asserted */
  private asserted = false

  /** Creates a new Exchange
   *
   *  @param broker - The rabbit broker
   *  @param name - The exchange name
   *  @param config - The exchange settings
   */
  constructor(private broker: Rabbit, readonly name: string, private config: ExchangeConfig = {}) {}

  /** Get the exchange type */
  get type(): "topic"|"fanout"|"direct"|"header" {
    if (this.config.type) return this.config.type
    if (this.config.hasOwnProperty("topics")) return "topic"
    if (this.config.hasOwnProperty("fanout")) return "fanout"
    if (this.config.hasOwnProperty("direct")) return "direct"
    return "topic"
  }

  /** Asserts the exchange into existence */
  async assert() {
    if (this.asserted) return this
    const channel = await this.broker.channel("__write__").connect()
    await channel.assertExchange(this.name, this.type, this.config)
    this.asserted = true
    return this
  }

  /** Binds a queue to that exchange
   *
   *  @param queue - The "high level queue" (from `broker#queue(name)`)
   */
  async bind(queue: Queue, routingKey: string = "") {
    // TODO: ensure queue is asserted
    await this.broker.channel("__write__").bindQueue(queue.name, this.name, routingKey)
  }

  /** Publish a message to the exchange
   *
   *  @param routingKey - Tells the exchange how the message should be routed
   *  @param message - The message to send. If it is an object and no
   *  options.contentType is set, the message will be stringified in json, using
   *  {@link https://npmjs.com/fast-safe-stringify fast-safe-stringify} and the
   *  content-type will be set to `application/json`, so that the consumer will
   *  be able to parse it properly.
   *  If the message is a buffer, no content-type will be set
   *  @param options - Some options
   */
  async pub(routingKey: string, message: Object|Buffer, options: MsgOptions = {}) {
    this.broker.channel("__write__").publish(this.name, routingKey, ...prepareMessage(message, options))
  }
}