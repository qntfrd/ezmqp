import amqp from "amqplib"
import { Channel } from "./channel"
import { Exchange } from "./exchange"
import { Queue } from "./queue"
import { InternalConfiguration, Connection, Configuration, ExchangeConfig, QueueConfig } from "./types"
import { loadConfiguration } from "./configuration"

export class Rabbit {
  //#region private attributes
  /** The actual configuration */
  private configuration: InternalConfiguration
  /** The current selected node */
  private server: number = 0

  private closing = false

  /** The actual amqp connection */
  private client: amqp.Connection | null = null
  /** List of existing exchanges */
  private exchanges: Map<string, Exchange> = new Map()
  /** List of existing channels */
  private channels: Map<string, Channel> = new Map()
  /** List of existing queues */
  private queues: Map<string, Queue> = new Map()
  //#endregion

  /** Creates a client by loading a configuration
   *
   *  @throws "Invalid protocol '%s'"
   *  @throws "Invalid port '%s'"
   *  @throws "Invalid channel '%s'. Expected range between 0 and 2^16-1"
   *  @throws "Invalid frameMax '%s'. Expected range between 0 and 2^32-1"
   *  @throws "Invalid heartbeat '%s'. Expected range between 0 and 2^32-1"
   *  @throws "Invalid vhost '%s'. Must start with '/'
   */
  constructor(configuration: Configuration)
  constructor(connection?: Connection|string|Array<Connection|string>, configuration?: Configuration)
  constructor(connection?: Connection|Configuration|string|Array<Connection|string>, configuration?: Configuration) {
    this.configuration = loadConfiguration(connection, configuration)
  }

  //#region getters/setters
  /** Gets the list of available servers
   *
   *  @note When the output is stringified, either with toString or toJSON,
   *  The password will be hidden with `****`
   */
  get nodes(): Array<Required<Connection>> {
    return this.configuration.connection.nodes.map(node => {
      return {
        ...node,
        toString: function() {
          const cs = `${this.protocol}://${this.username}:****@${this.hostname}:${this.port}${this.vhost}`
          const query = [
            ...(this.frameMax === 0 ? [] : [`frameMax=${this.frameMax}`]),
            ...(this.channelMax === 0 ? [] : [`channelMax=${this.channelMax}`]),
            ...(this.heartbeat === 0 ? [] : [`heartbeat=${this.heartbeat}`]),
          ]
          if (query.length) return `${cs}?${query.join("&")}`
          return cs
        },
        toJSON: function() {
          return { ...this, password: "****" }
        }
      }
    })
  }

  /** Whether the client is connected to the server */
  get connected() { return !!this.client }

  /** Get the actual rabbit connection (or throw if not connected)
   *
   *  @throws `Broker is not connected`
   */
  get connection(): amqp.Connection {
    if (this.client) return this.client
    throw new Error("Broker is not connected")
  }
  //#endregion

  /** Enfore the configuartion on the server
   *  that is, create queues and exchange and bind the two together
   */
  // private async setup() {
  //   for (const exchange in this.configuration.exchanges) {
  //     const cnf = this.configuration.exchanges[exchange]
  //     const ex = await this.exchange(cnf.name || exchange, cnf).assert()
  //     if (cnf.hasOwnProperty("topics")) {
  //       const c = cnf as { topics: {[key: string]: string|string[]}}
  //       await Promise.all(Object.keys(c.topics)
  //         .map(queue => {
  //           const qcnf = this.configuration.queues && this.configuration.queues[queue] || {}
  //           const qname = qcnf.name || queue
  //           return this.queue(qname, qcnf).assert().then(async q => {
  //             if (Array.isArray(c.topics[queue]))
  //               return Promise.all((c.topics[queue] as string[]).map(rk => ex.bind(q, rk)))
  //             return ex.bind(q, c.topics[queue] as string)
  //           })
  //         }))
  //     }
  //     else if (cnf.hasOwnProperty("direct")) {
  //       const c = cnf as {direct: {[key: string]: string|string[]}}
  //       await Promise.all(Object.keys(c.direct)
  //         .map(queue => {
  //           const qcnf = this.configuration.queues && this.configuration.queues[queue] || {}
  //           const qname = qcnf.name || queue
  //           return this.queue(qname, qcnf).assert().then(async q => {
  //             if (Array.isArray(c.direct[queue]))
  //               return Promise.all((c.direct[queue] as string[]).map(rk => ex.bind(q, rk)))
  //             return ex.bind(q, c.direct[queue] as string)
  //           })
  //         }))
  //     }
  //     else if (cnf.hasOwnProperty("fanout")) {
  //       const c = cnf as { fanout: string[] }
  //       await Promise.all(c.fanout.map(queue => {
  //         const qcnf = this.configuration.queues && this.configuration.queues[queue] || {}
  //         const qname = qcnf.name || queue
  //         return this.queue(qname, qcnf).assert().then(q => ex.bind(q))
  //       }))
  //     }
  //   }
  //   for (const queue in this.configuration.queues) {
  //     const cnf = this.configuration.queues[queue]
  //     await this.queue(cnf.name || queue, cnf).assert()
  //   }
  // }

  /** Connects to the server and apply the configuration
   *
   *  @param retry - The number of connection attempts
   *  @param frequency - How long to wait before each attempts
   *
   *  NOTE: retry and frequency are for connection attempts to the cluster,
   *  that is, if you have node A, B and C, connections attempts will occure
   *  like so, with a retry of 1 (one attempt + one retry):
   *  - A
   *  - B
   *  - C
   *  - wait _frequency_
   *  - A
   *  - B
   *  - C
   *
   */ // TODO: connection recovery and cluster mode
  async connect(retry?: number, frequency?: number): Promise<Rabbit> {
    if (this.client) return this

    const attempts = Math.max(0, retry ?? this.configuration.connection.retry)
    const freq = Math.max(0, Math.min(frequency ?? this.configuration.connection.frequency, Number.MAX_SAFE_INTEGER))

    try {
      this.client = await amqp.connect(this.configuration.connection.nodes[this.server])
      this.client.on("close", () => this.onClose())

      await Promise.all([...this.channels.values()].map(channel => channel.connect()))
    }
    catch (e) {
      this.server = (this.server + 1) % this.configuration.connection.nodes.length
      // If server + 1 === 0, then we've tried all nodes, otherwise we need to retry
      if (this.server !== 0) return this.connect(attempts, freq)
      // We've exhausted our attempts
      if (attempts === 0) throw e
      if (freq !== 0) await new Promise(resolve => setTimeout(resolve, freq))
      return this.connect(attempts - 1, freq)
    }

    // await this.setup()

    return this
  }

  async close() {
    if (!this.client) return this
    this.closing = true
    await this.client.close()
    return this
  }

  private onClose() {
    this.client = null
    if (this.closing) return
    return this.connect()
  }

  /** Retrieve or create a channel */
  channel(name: string): Channel {
    if (!this.channels.has(name))
      this.channels.set(name, new Channel(this))
    return this.channels.get(name) as Channel
  }

  /** Retrieve or create an exchange */
  exchange(name: string, config: ExchangeConfig = {}): Exchange {
    if (!this.exchanges.has(name))
      this.exchanges.set(name, new Exchange(this, name, config))
    return this.exchanges.get(name) as Exchange
  }

  /** retrieve or create a queue */
  queue(name: string, config: QueueConfig = {}): Queue {
    if (!this.queues.has(name))
      this.queues.set(name, new Queue(this, name, config))
    return this.queues.get(name) as Queue
  }
}
