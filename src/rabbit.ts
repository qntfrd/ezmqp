import amqp from "amqplib"
import { Channel } from "./channel"
import { Exchange } from "./exchange"
import { Queue } from "./queue"
import { Connection, Configuration, ExchangeConfig, QueueConfig } from "./types"

const connectionStringToObject = (connectionString: string): Required<Connection> => {
  const url = new URL(connectionString)
  const params = Object.fromEntries(url.searchParams.entries())

  return validateConnection({
    protocol: url.protocol.slice(0, -1) as "amqp"|"amqps",
    hostname: !url.hostname ? "localhost" : url.hostname,
    username: !url.username ? "guest" : url.username,
    password: !url.password ? "guest" : url.password,
    port: !url.port ? 5672 : Number(url.port),
    // `as any as number` is to pass down any string to the validation to have nice errors
    channelMax: params.channelMax as any as number ?? 0,
    frameMax: params.frameMax as any as number ?? 0,
    heartbeat: params.heartbeat as any as number ?? 0,
    locale: "en_US",
    vhost: !url.pathname ? "/" : url.pathname
  })
}

/** Validates a connection string and transforms it into a VALID connection
 *  object
 *
 *  @param connectionString - The connection string to parse
 *  @returns - An array of valid connection object
 */
const parseConnectionString = (connectionString: string = "amqp://localhost"): Array<Required<Connection>> => {
  if (connectionString.includes(","))
    return connectionString.split(",").map(connectionStringToObject)
  return [connectionStringToObject(connectionString)]
}

const validateNumber = (
  value: string|number|null|undefined,
  fallback: number = 0,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  err = "Invalid number '%s'."
): number => {
  if (value === undefined || value === null || value === "") return fallback
  if (Number.isNaN(Number(value)) || Number(value) != value)
    throw new Error(err.replace("%s", value + ""))
  const v = Number(value)
  if (v < min || v > max)
    throw new Error(err.replace("%s", value + ""))
  return v
}

const validateConnection = (connection: Partial<Connection>): Required<Connection> => {

  const co: Required<Connection> = {
    protocol: ((): "amqp"|"amqps" => {
      if  (!connection.protocol) return "amqp"
      if (connection.protocol === "amqps") return "amqps"
      if (connection.protocol === "amqp") return "amqp"
      throw new Error(`Invalid protocol '${connection.protocol}'`)
    })(),

    hostname: connection.hostname ?? "localhost",
    username: !!connection.username ? connection.username : "guest",
    password: !!connection.username ? connection.password : "guest",

    port: validateNumber(connection.port, 5672, 0, 65535, "Invalid port '%s'"),
    channelMax: validateNumber(connection.channelMax, 0, 0, 2**16-1, "Invalid channelMax '%s'. Expected range between 0 and 2^16-1"),
    frameMax: validateNumber(connection.frameMax, 0, 0, 2**32-1, "Invalid frameMax '%s'. Expected range between 0 and 2^16-1"),
    heartbeat: validateNumber(connection.heartbeat, 0, 0, 2**32-1, "Invalid heartbeat '%s'. Expected range between 0 and 2^16-1"),

    locale: connection.locale ?? "en_US",
    vhost: !!connection.vhost ? connection.vhost : "/"
  }

  if (co.vhost[0] !== "/") throw new Error(`Invalid vhost '${co.vhost}'. Must start with '/'`)

  return co
}

export class Rabbit {
  /** The list of available servers */
  private servers: Array<Required<Connection>>

  /** The actual amqp connection */
  private client: amqp.Connection | null = null
  /** List of existing exchanges */
  private exchanges: Map<string, Exchange> = new Map()
  /** List of existing channels */
  private channels: Map<string, Channel> = new Map()
  /** List of existing queues */
  private queues: Map<string, Queue> = new Map()

  /** Creates a client by loading a configuration */
  constructor(configuration: Configuration)
  constructor(connection?: Connection|string|Array<Connection|string>, configuration?: Configuration)
  constructor(connection?: Connection|Configuration|string|Array<Connection|string>, configuration?: Configuration) {
    if (connection === null || connection === undefined || typeof connection === "string") {
      this.servers = parseConnectionString(connection as string)
    }
    else if (Array.isArray(connection)) {
      this.servers = connection.map(co => {
        if (typeof co === "string") return parseConnectionString(co)
        else return validateConnection(co)
      }).flat()
    }
    else if (typeof connection === "object" && (
      connection.hasOwnProperty("protocol")
      || connection.hasOwnProperty("hostname")
      || connection.hasOwnProperty("username")
      || connection.hasOwnProperty("password")
      || connection.hasOwnProperty("port")
      || connection.hasOwnProperty("channelMax")
      || connection.hasOwnProperty("frameMax")
      || connection.hasOwnProperty("heartbeat")
      || connection.hasOwnProperty("vhost")
    )) {
      this.servers = [validateConnection(connection as Connection)]
    }
    else if (connection.hasOwnProperty("connection")) {
      const co = connection as Configuration
      if (co.connection === null || co.connection === undefined || typeof co.connection === "string")
        this.servers = parseConnectionString(co.connection as string)
      else if (Array.isArray(co.connection)) {
        this.servers = co.connection.map(c => {
          if (typeof c === "string") return parseConnectionString(c)
          else return validateConnection(c)
        }).flat()
      }
      else if (typeof co.connection === "object") {
        this.servers = [validateConnection(co.connection as Connection)]
      }
    }
  }

  get nodes(): Array<Required<Connection>> {
    return [...this.servers.map(node => {
      return {
        ...node,
        toString: function() {
          const cs = `${this.protocol}://${this.username}:****@${this.hostname}:${this.port}${this.vhost}`
          if (this.heartbeat === 0 && this.channelMax === 0 && this.frameMax === 0)
            return cs
          const query = []
          if (this.frameMax !== 0) query.push(`frameMax=${this.frameMax}`)
          if (this.channelMax !== 0) query.push(`channelMax=${this.channelMax}`)
          if (this.heartbeat !== 0) query.push(`heartbeat=${this.heartbeat}`)
          return `${cs}?${query.join("&")}`
        },
        toJSON: function() {
          return { ...this, password: "****" }
        }
      }
    })]
  }

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

  /** Connects to the server and apply the configuration */ // TODO: connection recovery and cluster mode
  async connect(): Promise<Rabbit> {
    if (this.client) return this
    // this.client = await amqp.connect(this.configuration.connection)

    // await this.setup()

    return this
  }

  async close() {
    if (!this.client) return this
    await this.client.close()
    this.client = null
    return this
  }

  /** Retrieve or create a channel */
  channel(name: string): Channel {
    if (!this.client) throw new Error("Broker is not connected") // TODO: should that stay here? / Should we autoconnect?
    if (!this.channels.has(name))
      this.channels.set(name, new Channel(this.client))
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
