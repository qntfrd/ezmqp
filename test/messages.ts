import { expect } from "chai"
import { Rabbit } from "../src"

describe("Messages", () => {
  const broker = new Rabbit("amqp://admin:admin@localhost:5001")
  before(() => broker.connect())
  after(() => broker.close())
  it("Should automatically convert object to json", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue] = await Promise.all([
        broker.exchange("test.messages.toJson", { type: "direct" }).assert(),
        broker.queue("test.messages.toJson").assert(),
      ])
      await exchange.bind(queue)

      queue.sub(msg => {
        try { expect(msg.content).to.eql({ foo: "bar" }) }
        catch (e) { return reject(e) }
        resolve()
      })
      exchange.pub("", { foo: "bar" })
    })
  })
  it("Should handle cyclic objects", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue] = await Promise.all([
        broker.exchange("test.messages.cyclicObjects", { type: "direct" }).assert(),
        broker.queue("test.messages.cyclicObjects").assert(),
      ])
      await exchange.bind(queue)

      queue.sub(msg => {
        try { expect(msg.content).to.eql({ foo: "bar", obj: "[Circular]" }) }
        catch (e) { return reject(e) }
        resolve()
      })

      const obj = { foo: "bar", obj: null }
      obj.obj = obj
      exchange.pub("", obj)
    })
  })
  it("Should override json header", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue] = await Promise.all([
        broker.exchange("test.messages.contentOverride", { type: "direct" }).assert(),
        broker.queue("test.messages.contentOverride").assert(),
      ])
      await exchange.bind(queue)

      queue.sub(msg => {
        try {
          expect(msg.content).to.be.instanceOf(Buffer)
          expect(msg.contentType).to.eql("text/plain")
          expect(msg.content.toString()).to.eql('{"foo":"bar"}')
        }
        catch (e) { return reject(e) }
        resolve()
      })

      const obj = { foo: "bar" }
      exchange.pub("", obj, { contentType: "text/plain" })
    })
  })
  it("Should handle buffers", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue] = await Promise.all([
        broker.exchange("test.messages.buffer", { type: "direct" }).assert(),
        broker.queue("test.messages.buffer").assert(),
      ])
      await exchange.bind(queue)

      queue.sub(msg => {
        try {
          expect(msg.content).to.be.instanceOf(Buffer)
          expect(msg.contentType).to.be.undefined
          expect(msg.content.toString()).to.eql('{"foo":"bar"}')
        }
        catch (e) { return reject(e) }
        resolve()
      })

      exchange.pub("", Buffer.from('{"foo":"bar"}'))
    })
  })
  it("Should handle buffers with json header", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue] = await Promise.all([
        broker.exchange("test.messages.jsonbuffer", { type: "direct" }).assert(),
        broker.queue("test.messages.jsonbuffer").assert(),
      ])
      await exchange.bind(queue)

      queue.sub(msg => {
        try {
          expect(msg.content).to.be.instanceOf(Object)
          expect(msg.contentType).to.be.eql("application/json")
          expect(msg.content).to.eql({foo:"bar"})
        }
        catch (e) { return reject(e) }
        resolve()
      })

      exchange.pub("", Buffer.from('{"foo":"bar"}'), { contentType: "application/json"})
    })
  })
  it("Should handle buffers with text header", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue] = await Promise.all([
        broker.exchange("test.messages.textBuffer", { type: "direct" }).assert(),
        broker.queue("test.messages.textBuffer").assert(),
      ])
      await exchange.bind(queue)

      queue.sub(msg => {
        try {
          expect(msg.content).to.be.instanceOf(Buffer)
          expect(msg.contentType).to.be.eql("text/plain")
          expect(msg.content.toString()).to.eql('{"foo":"bar"}')
        }
        catch (e) { return reject(e) }
        resolve()
      })

      exchange.pub("", Buffer.from('{"foo":"bar"}'), { contentType: "text/plain"})
    })
  })
  it("Should set the message id, app id and timestamp on send", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue] = await Promise.all([
        broker.exchange("test.messages.metadata.default", { type: "direct" }).assert(),
        broker.queue("test.messages.metadata.default").assert(),
      ])
      await exchange.bind(queue)

      queue.sub(msg => {
        try {
          expect(msg).to.include.all.keys("messageId", "timestamp", "appId")
          expect(msg.messageId).to.be.a("string").and.not.to.be.empty
          expect(msg.appId).to.eql("ezmqp")
          expect(msg.timestamp).to.be.a("number").gte(Date.now() - 100)
        }
        catch (e) { return reject(e) }
        resolve()
      })

      exchange.pub("", { foo : "bar"})
    })
  })
  it("Should override the message id, app id and timestamp on send", () => {
    return new Promise<void>(async (resolve, reject) => {
      const [exchange, queue] = await Promise.all([
        broker.exchange("test.messages.metadata.override", { type: "direct" }).assert(),
        broker.queue("test.messages.metadata.override").assert(),
      ])
      await exchange.bind(queue)

      queue.sub(msg => {
        try {
          expect(msg).to.include.all.keys("messageId", "timestamp", "appId")
          expect(msg.messageId).to.eql("42")
          expect(msg.appId).to.eql("foo")
          expect(msg.timestamp).to.eql(10)
        }
        catch (e) { return reject(e) }
        resolve()
      })

      exchange.pub("", { foo : "bar" }, { messageId: "42", timestamp: 10, appId: "foo"})
    })
  })
})