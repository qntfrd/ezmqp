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

## Ack/Nack

Using ezmqp, messages will automatically be acknowledgeed if your handler
function resolves (and nack if it rejects).

If you want to manually ack/nack, your handler will receive an `ack` function as
a parameter.
If you call it without parameters (or a truthy one), it will ack.  
If you pass false or error, it will nack
