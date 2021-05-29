import { Rabbit } from "../src"
import { expect } from "chai"

describe("Handler Chain", () => {
  const broker = new Rabbit("amqp://admin:admin@localhost:5001", {
    exchanges: {
      "test.handlerchain": {
        fanout: "test.handlerchain"
      }
    }
  })

  before(() => broker.connect())
  after(() => broker.close())
  afterEach(() => broker.queue("test.handlerchain").cancel())

  it("Should be able to chain handlers", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("test.handlerchain").sub<{ add: number }>(
      (msg, next) => {
        try { expect(msg.content).to.eql({ add: 5 })}
        catch (e) { return reject(e) }
        msg.content.add += 5
        next()
      }, msg => {
        try { expect(msg.content).to.eql({ add: 10 })}
        catch (e) { return reject(e) }
        resolve()
      })
    broker.exchange("test.handlerchain").pub("", { add: 5 })
  }))
  it("Should be able to nest handlers", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("test.handlerchain").sub<{ add: number }>(
      (msg, next) => {
        next()
        try { expect(msg.content).to.eql({ add: 10 })}
        catch (e) { return reject(e) }
        resolve()
      }, msg => {
        try { expect(msg.content).to.eql({ add: 5 })}
        catch (e) { return reject(e) }
        msg.content.add += 5
      })
    broker.exchange("test.handlerchain").pub("", { add: 5 })
  }))
  it("Should have a handler to be awaitable", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("test.handlerchain").sub<{ add: number }>(
      async (msg, next) => {
        await next()
        try { expect(msg.content).to.eql({ add: 10 })}
        catch (e) { return reject(e) }
        resolve()
      }, msg => {
        try { expect(msg.content).to.eql({ add: 5 })}
        catch (e) { return reject(e) }
        msg.content.add += 5
        return Promise.resolve()
      })
    broker.exchange("test.handlerchain").pub("", { add: 5 })
  }))
  it("Should be able to call next handler with next(true)", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("test.handlerchain").sub<{ add: number }>(
      async (msg, next) => {
        await next(true)
        try { expect(msg.content).to.eql({ add: 10 })}
        catch (e) { return reject(e) }
        resolve()
      }, msg => {
        try { expect(msg.content).to.eql({ add: 5 })}
        catch (e) { return reject(e) }
        msg.content.add += 5
        return Promise.resolve()
      })
    broker.exchange("test.handlerchain").pub("", { add: 5 })
  }))
  it("Should break the chain by calling next(false)", () => new Promise<void>(async (resolve, reject) => {
    let count = 0
    broker.queue("test.handlerchain").sub((msg, next) => {
      if (count++ === 0)
        next(false)
      else
        resolve()
    }, () => reject(new Error("Should not have been called")))
    broker.exchange("test.handlerchain").pub("", {})
  }))
  it("Should break the chain by calling next(Error)", () => new Promise<void>(async (resolve, reject) => {
    let count = 0
    broker.queue("test.handlerchain").sub((msg, next) => {
      if (count++ === 0)
        next(new Error("meh"))
      else
        resolve()
    }, () => reject(new Error("Should not have been called")))
    broker.exchange("test.handlerchain").pub("", {})
  }))
  it("Should break the chain by throwing before calling next", () => new Promise<void>(async (resolve, reject) => {
    let count = 0
    broker.queue("test.handlerchain").sub((msg, next) => {
      expect(count++).to.eql(1)
      if (count !== 2) next()
      resolve()
    }, () => reject(new Error("Should not have been called")))
    broker.exchange("test.handlerchain").pub("", {})
  }))
})
