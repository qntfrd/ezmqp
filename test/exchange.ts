import { expect } from "chai"
import { Rabbit } from "../src"

describe("Exchanges", () => {
  const broker = new Rabbit({ connection: "amqp://admin:admin@localhost:5001/"})
  before(() => broker.connect())
  after(() => broker.close())

  it("Should be able to send a message to a direct exchange", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue1, queue2, queue3 ] = await Promise.all([
        broker.exchange("test.exchange.direct", { type: "direct" }).assert(),
        broker.queue("test.exchange.direct.q1").assert(),
        broker.queue("test.exchange.direct.q2").assert(),
        broker.queue("test.exchange.direct.q3").assert(),
      ])
      await Promise.all([
        exchange.bind(queue1),
        exchange.bind(queue2),
        exchange.bind(queue3),
      ])
      const set = new Set()
      const rand = Math.random()
      const resolver = (queueName: string, message: { hello: Number}) => {
        try { expect(message.hello).to.eql(rand) }
        catch (e) { return reject(e) }
        set.add(queueName)
        if (set.size === 3)
          resolve()
      }
      queue1.sub<{hello: number}>(msg => resolver("queue1", msg.content))
      queue2.sub<{hello: number}>(msg => resolver("queue2", msg.content))
      queue3.sub<{hello: number}>(msg => resolver("queue3", msg.content))
      exchange.pub("", { hello: rand })
    })
  })
  it("Should be able to send a message to a fanout exchange", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue1, queue2, queue3 ] = await Promise.all([
        broker.exchange("test.exchange.fanout", { type: "fanout" }).assert(),
        broker.queue("test.exchange.fanout.q1").assert(),
        broker.queue("test.exchange.fanout.q2").assert(),
        broker.queue("test.exchange.fanout.q3").assert(),
      ])
      await Promise.all([
        exchange.bind(queue1),
        exchange.bind(queue2),
        exchange.bind(queue3),
      ])
      const set = new Set()
      const rand = Math.random()
      const resolver = (queueName: string, message: { hello: Number}) => {
        try { expect(message.hello).to.eql(rand) }
        catch (e) { return reject(e) }
        set.add(queueName)
        if (set.size === 3)
          resolve()
      }
      queue1.sub<{hello: number}>(msg => resolver("queue1", msg.content))
      queue2.sub<{hello: number}>(msg => resolver("queue2", msg.content))
      queue3.sub<{hello: number}>(msg => resolver("queue3", msg.content))
      exchange.pub("", { hello: rand })
    })
  })
  it("Should be able to send a message to a topic exchange", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue1, queue2, queue3 ] = await Promise.all([
        broker.exchange("test.exchange.topic", { type: "topic" }).assert(),
        broker.queue("test.exchange.topic.q1").assert(),
        broker.queue("test.exchange.topic.q2").assert(),
        broker.queue("test.exchange.topic.q3").assert(),
      ])
      await Promise.all([
        exchange.bind(queue1, "#.logs"),
        exchange.bind(queue2, "foo.logs"),
        exchange.bind(queue3, "foo.bar"),
      ])
      const set = new Set()
      const rand = Math.random()
      const resolver = (queueName: string, message: { hello: Number}) => {
        try { expect(message.hello).to.eql(rand) }
        catch (e) { return reject(e) }
        set.add(queueName)
        if (set.has("queue3"))
          return reject(new Error("Message should not have been routed here"))
        if (set.has("queue1") && set.has("queue2"))
          resolve()
      }
      queue1.sub<{hello: number}>(msg => resolver("queue1", msg.content))
      queue2.sub<{hello: number}>(msg => resolver("queue2", msg.content))
      queue3.sub<{hello: number}>(msg => resolver("queue3", msg.content))
      exchange.pub("foo.logs", { hello: rand })
    })
  })
  it("Should be able to send a message to a header exchange")
})