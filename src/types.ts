/** Configure an exchange */
export type ExchangeConfig = {
  /** The name of the exchange
   *
   *  In the configure object, the name of the exchange is the key value.
   *  This property overrides it.
   *
   *  @note This field is only used in the context of the configuration object
   */
  name?: string

  /** The type of exchange to create
   *
   *  @note This field is only used in the context of the configuration object
   *
   *  - **topic**: Route messages according to a routing key
   *  - **direct**: Route messages to a named queue
   *  - **fanout**: Route messages to all bound queues
   *  - **headers**: Route messages based on their headers
   */
  type?: "topic"|"fanout"|"direct"|"header",

  /** List queues to fanout to
   *
   *  @note This is only used in the context of the configuration object
   *
   *  If this field is set, the type of exchange will be forcibly set to fanout
   *  and bindings to the queues will be automatically created
   */
  fanout?: string|string[],

  /** List queues to route to
   *
   *  @note This field is only used in the context of the configuration object
   *
   *  If this field is set, the type of exchange will be forcibly set to topic
   *  and bindings will be created using the routingKey (object key) to the
   *  queues (object values)
   */
  topics?: {[ routingKey: string ]: string|string[] },

  /** List queues to manually send messages
   *
   *  @note This field is only used in the context of the configuration
   *
   *  If this field is set, the type of exchange will be forcibly set to direct
   *  and bindings will be created using the queue name (object key) to the
   *  queues (object values)
   */
  direct?: {[ key: string ]: string|string[] },

  /** Whether to survive broker restart
   *
   *  @default true
   */
  durable?: boolean

  /** Forbidd direct message publish
   *
   *  It can only be the target of bindings, or possibly create messages ex-nihilo
   *
   *  @default false
   */
  internal?: boolean

  /** delete the exchange when bindings drop to 0
   *
   *  @default false
   */
  autoDelete?: boolean

  /** Forward the message to that exchange if this exchange cannot route it */
  alternateExchange?: string

  /** Any Additional argumrnts that may be needed */
  arguments?: any
}

/** Configure a queue */
export type QueueConfig = {
  /** The queue name
   *
   *  In the configuration object the name of the queue is the key of the queues
   *  object. This fields override it.
   *
   *  @note This field is only used in the context of the configuration
   */
  name?: string|null

  /** Scopes the queue to the connection
   *
   *  @default false
   */
  exclusive?: boolean

  /** Whether to survive broker restarts
   *
   *  @default true
   */
  durable?: boolean

  /** Delete when the number of consumers drops to zero
   *
   *  @default false
   */
  autoDelete?: boolean

  /** Expires messages that were on the queue for _n_ ms */
  messageTtl?: number

  /** Expire the QUEUE if it is not used
   *
   *  use means having consumers, being declared (asserted or checked, in this
   *  API), or being polled with a #get.
   */
  expires?: number

  /** An exchange to which messages discarded from the queue will be resent
   *
   *  Use deadLetterRoutingKey to set a routing key for discarded messages;
   *  otherwise, the message’s routing key (and CC and BCC, if present) will be
   *  preserved. A message is discarded when it expires or is rejected or
   *  nacked, or the queue limit is reached.
   */
  deadLetterExchange?: string

  /** Set a routing key for discarded messages */
  deadletterRoutingKey?: string

  /** The maximum number of messages the queue will allow
   *
   *  Older messages will be deadlettered
   */
  maxLength?: number

  /** Additional arguments
   *
   *  Usually parameters for some kind of broker-specific extension e.g.,
   *  high availability, TTL.
   *
   *  RabbitMQ extensions can also be supplied as options. These typically
   *  require non-standard x-* keys and values, sent in the arguments table
   *  e.g., 'x-expires'. When supplied in options, the x- prefix for the key is
   *  removed; e.g., 'expires'.
   *
   *  Values supplied in options will overwrite any analogous field you put in
   *  options.arguments.
   */
  arguments?: {[key: string]: string}
}

/** Defines how to connect to the server */
export type Connection = {
  /** Whether to use amqp or amqps
   *
   *  @default "amqp"
   */
  protocol?: "amqp"|"amqps"

  /** The rabbit node hostname
   *
   *  @default "localhost"
   */
  hostname?: string

  /** The port the server listens to
   *
   *  @default 5672
   */
  port?: number

  /** The username to connect to rabbit with
   *
   *  @default "guest"
   */
  username?: string

  /** The user's password
   *
   *  @default "guest"
   */
  password?: string

  /** The locale to use for rabbit error
   *
   *  @notice Rabbit only uses `en_US`
   *  @default "en_US"
   */
  locale?: "en_US"

  /** The size in bytes of the maximum frame allowed over the connection
   *
   *  0 means no limit, but since frames have a size field which is an unsigned
   *  32 bit integer, it’s perforce 2^32 - 1
   *
   *  @default 0
   */
  frameMax?: number

  /** The maximum number of channel allowed
   *
   *  0 means no limit, or 2^16 - 1
   *
   *  @default 0
   */
  channelMax?: number

  /** The period of the connection heartbeat, in seconds
   *
   *  If you supply a non-zero period in seconds as the heartbeat parameter, the
   *  connection will be monitored for liveness. If the client fails to read
   *  data from the connection for two successive intervals, the connection will
   *  emit an error and close. It will also send heartbeats to the server (in
   *  the absence of other data).
   *
   *  If you supply 0 as the heartbeat parameter (or defaults to 0), the server
   *  value is used. This means that you can only disable heartbeat if the
   *  server value is also 0. See [here](https://www.rabbitmq.com/configure.html)
   *  for more details.
   *
   *  NOTE: Please consider NOT disabling heartbeats because they exist for a
   *  [reason](http://www.rabbitmq.com/heartbeats.html).
   *
   *  @default 0
   */
  heartbeat?: number

  /** The vhost to use
   *
   *  @default "/"
   */
  vhost?: string
}

export type ConnectionString = string|Connection|Array<string|Connection>

export type Configuration = {
  connection?: {
    /** List of nodes in the cluster */
    nodes?: ConnectionString,

    /** How many cluster connection should be attempted
     *
     *  A cluster attempts is the attempt to connect to each node of the cluster
     *  at least once.
     *  If you have 3 nodes, A, B and C, ezmqp will try to connect to each one
     *  once in order to consider this one attempt
     *
     *  **NB**: The first attempt does not count as a retry, thus if you set
     *  retry to 1, you'll have one initial try and one retry, totalling two
     *  attempts.
     *
     *  @default Infinity
     */
    retry?: number,

    /** How long to wait between each attempts
     *
     *  An attempt is the attmpt to connect to the cluster and not individual
     *  nodes.
     *  Thus if you have a cluster of 3 nodes, A, B and C with a retry 1, the
     *  following will happen:
     *  - initial attempt to A
     *  - initial attempt to B
     *  - initial attempt to C
     *  - wait `frequency`
     *  - 1st retry to A
     *  - 1st retry to B
     *  - 1st retry to C
     *  - throw if all failed
     *
     *  @default 0
     */
    frequency?: number,
  } | ConnectionString
  exchanges?: {
    [key: string]: ExchangeConfig
  },
  queues?: {
    [key: string]: QueueConfig
  }
}

export type InternalConfiguration = {
  connection: {
    nodes: Array<Required<Connection>>
    retry: number
    frequency: number
  }
  exchanges?: {
    [key: string]: ExchangeConfig,
  }
  queues?: {
    [key: string]: QueueConfig
  }
}

/** Message options that can be send or received */
export type MsgData = {
  headers?: { [key: string]: any }

  /** MIME type of the message content
   *
   *  @default `application/json`
   *  @note Using with `broker.channel` directly will not set any value
   */
  contentType?: string

  /** MIME for encoding the message */
  contentEncoding?: string

  /** Usually used to match replies to request (e.g. in RPC case) */
  correlationId?: string

  /** Name a queue the consumer will reply to (e.g. in RPC case) */
  replyTo?: string

  /** The message id
   *
   *  @default `nanoid()`
   *  @note Using with `broker.channel` directly will not set any value
  */
  messageId?: string

  /** A timestamp for the message
   *
   *  @default `Date.now()`
   *  @note Using with `broker.channel` directly will not set any value
   */
  timestamp?: number

  /** An arbitrary application specific type */
  type?: string

  /** An arbitrary identifier for for your app
   *
   *  @default `process.env.npm_package_name`
   *  @note Using with `broker.channel` directly will not set any value
   */
  appId?: string
}

/** Message options to send */
export type MsgOptions = {
  /** If the message stays on the queue longer than expiration, discard it */
  expiration?: number

  /** The user who openned the connection must have the same id as `userId` */
  userId?: string

  /** Also send messages to those routing keys (consumers will know) */
  CC?: string|string[]
  /** Also send messages to those routing keys (consumers won't know) */
  BCC?: string|string[]

  /** Whether message must survive broker restart (given that the queue does too) */
  persistent?: boolean

  /** If true and the message fails to be routed, return it */
  mandatory?: boolean
} & MsgData

/** Message options to receive */
export type ReceivedMessage<T> = {
  content: T,
} & MsgData

/** Some options for the consumer */
export type ConsumerOptions = {
  /** A name which the server will use to distinguish message deliveries for the consumer
   *
   *  @warn mustn’t be already in use on the channel
   *
   *  It’s usually easier to omit this, in which case the server will create a
   *  random name and supply it in the reply.
   */
  consumerTag?: string

  /** if true, the broker won't expect acknowledgement
   *
   *  @default false
   */
  noAck?: boolean

  /** If true, the broker won’t let anyone else consume from this queue */
  exclusive?: boolean

  /** Gives a priority to the consumer
   *
   *  higher priority consumers get messages in preference to lower priority consumers
   *
   *  @see {@link http://www.rabbitmq.com/consumer-priority.html Rabbit Extesion}
   */
  priority?: number
}

export type Ack = (success?: boolean|Error) => void|Promise<void>
export type Handler<T> = (message: ReceivedMessage<T>, ack: Ack) => Promise<void>|void