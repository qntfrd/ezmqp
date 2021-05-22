# ezmqp

🐰 Rabbit MQ made easy

## Usage

```js
const { Rabbit } = require("ezmqp")

const broker = new Rabbit({
  connection: "amqp://username:password@host:5672/vhost?frameMax=0",
  exchanges: {
    hello: {      // create an exchange named "hello"
      fanout: [   // the exchange will fanout to the following queue, and create the queues
        "you",    // will create the queue you and bind it to that exchange
        "world",  // will use the `world` queue (which is configured with a deadletter)
      ],
    },
    dlx_hello: {  // create an exchange named dlx_hello
      direct: "dlx_hello" // and create a queue `dlx_hello` bound to that exchange
    }
  },
  queues: {
    world: {
      deadletter: "dlx_hello", // if a message fails, it will be published to
                               // `dlx_hello` exchange which has a `dlx_hello`
                               // queue bound to it
    },
  }
})

await broker.connect() // asserts the config on the server (creates exchanges and queue)

broker.exchange("hello") // retrive the hello exchange
  .pub( "", { hello: "everyone" }) // and publish. Because it's fanout, everybody will receive it

broker.queue("world")         // retrive the `world` queue
  .sub(msg => {               // register a subscriber
    console.log(msg.content)  // and print the message content
  })
```

One can also create queues and exchange dynamically

```js
const { Rabbit } = require("ezmqp")

const broker = await new Rabbit({ connection: "amqp://localhost:5672" }).connect()

// creates the exchange if it does not exist
const exchange = await broker.exchange("hello", {type: "fanout"}).assert()
// creates the queue if it does not exist
const queue = await broker.queue("world").assert()

// bind the queue to the exchange (if it wasn't already done)
await exchange.bind(queue)

exchange.pub("", { hello: "everyone" })
queue.sub(msg => console.log(msg))

// You can also unsubscribe the consumer
await queue.cancel()
```

Using ezmqp, messages will automatically be acknowledgeed if your handler
function resolves (and nack if it rejects).

If you want to manually ack/nack, your handler will receive an `ack` function as
a parameter.
If you call it without parameters (or a truthy one), it will ack.  
If you pass false or error, it will nack


## Api

- [ezmqp](#ezmqp)
  - [Usage](#usage)
  - [Api](#api)
    - [Rabbit](#rabbit)
      - [Constructor](#constructor)
      - [nodes: List server's connection options](#nodes-list-servers-connection-options)
    - [Types](#types)
      - [Connection](#connection)
      - [Configuration](#configuration)

### Rabbit

#### Constructor

```ts
Rabbit#Constructor(configuration: Configuration) => Rabbit
Rabbit#Constructor(
  connection?: string|Connection|Array<string|Connection>,
  configuration?: Configuration
) => Rabbit
```

You can use the constructor either by passing a [Configuration](#configuration)
object which defines everything for you beforehand, including the connection.

You can also pass in the [Configuration](#configuration) separately from
connection options by providing either a [Connection](#connection) object or a
connection string BEFORE the [Configuration](#configuration) object (which then
becomes optional). In that case, the [Configuration](#configuration) connection
field will be **ignored** to the profit of what is passed in the connection
parameter.

If you use a rabbit cluster, you can pass an array of connection string or
[Connection](#connection) objects. If your connection string has comma `,`, it
will be considered as a connection to a cluster and the string will be split.

The connection string can have query parameters for frameMax, heartbeat and
channelMax (e.g. `amqp://localhost/?frameMax=4096`)

#### nodes: List server's connection options

```ts
get nodes() => Array<Required<Connection>>
```

Returns the list of connection objects.

Note: Each item can be safely stringified or jsonified because the password will
be hidden by `****`

### Types

#### Connection

Defines how the connection to a rabbit server must be established

- `protocol: "amqp"|"amqps" = "amqp"` Whether to use amqp or amqps
- `hostname: string = "localhost"` The rabbit server hostname
- `port: number = 5672` The port the server listens
- `username: string = "guest"` The user to connect to the server with
- `password: string = "guest"` The user's password
- `locale: "en_US" = "en_US"` The locale to use for rabbit errors (only en_US is
handeled by rabbit)
- `frameMax: number = 0` The size in bytes of the maxium amount of data in a
message. 0 means no limit (which is `2^32-1`)
- `channelMax: number = 0` The maximum number of channels. 0 means no limit
(which is `2^16-1`)
- `heartbeat: number = 0` The frequency in second to check whether the
connection to the server is up. 0 means takes the server configuration.

Note: For your convienence, the configuration object is partial (which means all
its fields are optional), however, if you read from it, all its fields will be
set to their default values.

Also, converting this object as a string will output the connection string, with
all fields except the default query parameter, and the password hidden by `****`.
If you try to jsonify the object, the password will also be hidden by `****`.


#### Configuration