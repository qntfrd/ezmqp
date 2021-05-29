import { Rabbit } from "../src"
import { expect } from "chai"

describe("Ack/Nack", () => {
  const broker = new Rabbit("amqp://admin:admin@localhost:5001", {
    exchanges: {
      "test.acknack": {
        topics: {
          "test.acknack.returns": "test.acknack.returns",
          "test.acknack.resolves": "test.acknack.resolves",
          "test.acknack.next": "test.acknack.next",
          "test.acknack.next.true": "test.acknack.next.true",
          "test.acknack.throw": "test.acknack.throw",
          "test.acknack.rejects": "test.acknack.rejects",
          "test.acknack.next.false": "test.acknack.next.false",
          "test.acknack.next.error": "test.acknack.next.error",
          "test.acknack.throw.dlx": "test.acknack.throw.dlx",
          "test.acknack.rejects.dlx": "test.acknack.rejects.dlx",
          "test.acknack.next.false.dlx": "test.acknack.next.false.dlx",
          "test.acknack.next.error.dlx": "test.acknack.next.error.dlx",
        }
      },
      "dlx_test.acknack": {
        topics: {
          "dlx_test.acknack.throw": "test.acknack.throw.dlx",
          "dlx_test.acknack.rejects": "test.acknack.rejects.dlx",
          "dlx_test.acknack.next.false": "test.acknack.next.false.dlx",
          "dlx_test.acknack.next.error": "test.acknack.next.error.dlx",
        }
      }
    },
    queues: {
      "test.acknack.throw.dlx": { deadLetterExchange: "dlx_test.acknack" },
      "test.acknack.rejects.dlx": { deadLetterExchange: "dlx_test.acknack" },
      "test.acknack.next.false.dlx": { deadLetterExchange: "dlx_test.acknack" },
      "test.acknack.next.error.dlx": { deadLetterExchange: "dlx_test.acknack" },
    }
  })
  before(() => broker.connect())
  after(() => broker.close())

  it("Should ack if the handler returns", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("test.acknack.returns").sub(msg => {
      try { expect(msg.content).to.eql({ foo: "returns" }) }
      catch (e) { return reject(e) }
      resolve()
    })
    broker.exchange("test.acknack").pub("test.acknack.returns", { foo: "returns" })
  }))
  it("Should ack if the handler resolves", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("test.acknack.resolves").sub(async msg => {
      expect(msg.content).to.eql({ foo: "returns" })
      resolve()
    })
    broker.exchange("test.acknack").pub("test.acknack.resolves", { foo: "returns" })
  }))
  it("Should ack if the handler calls next()", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("test.acknack.next").sub((msg, next) => {
      try { expect(msg.content).to.eql({ foo: "returns" }) }
      catch (e) { return reject(e) }
      next()
    }, () => resolve())
    broker.exchange("test.acknack").pub("test.acknack.next", { foo: "returns" })
  }))
  it("Should ack if the handler calls next(true)", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("test.acknack.next.true").sub((msg, next) => {
      try { expect(msg.content).to.eql({ foo: "returns" }) }
      catch (e) { return reject(e) }
      next(true)
    }, () => resolve())
    broker.exchange("test.acknack").pub("test.acknack.next.true", { foo: "returns" })
  }))
  it("Should nack + requeue if the handler throws", () => new Promise<void>(async (resolve, reject) => {
    let seen = 0
    broker.queue("test.acknack.throw").sub(() => {
      expect(seen++).to.eql(1)
      resolve()
    })
    broker.exchange("test.acknack").pub("test.acknack.throw", { foo: "returns" })
  }))
  it("Should nack + requeue if the handler rejects", () => new Promise<void>(async (resolve, reject) => {
    let seen = 0
    broker.queue("test.acknack.rejects").sub(async () => {
      expect(seen++).to.eql(1)
      resolve()
    })
    broker.exchange("test.acknack").pub("test.acknack.rejects", { foo: "returns" })
  }))
  it("Should nack + requeue if the handler calls next(false)", () => new Promise<void>(async (resolve, reject) => {
    let seen = 0
    broker.queue("test.acknack.next.false").sub((_, next) => {
      try { expect(seen++).to.eql(1) }
      catch { return next(false) }
      resolve()
    })
    broker.exchange("test.acknack").pub("test.acknack.next.false", { foo: "returns" })
  }))
  it("Should nack + requeue if the handler calls next(error)", () => new Promise<void>(async (resolve, reject) => {
    let seen = 0
    broker.queue("test.acknack.next.error").sub((_, next) => {
      try { expect(seen++).to.eql(1) }
      catch (e) { return next(e) }
      resolve()
    })
    broker.exchange("test.acknack").pub("test.acknack.next.error", { foo: "returns" })
  }))
  it("Should nack + deadletter if the handler throws", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("dlx_test.acknack.throw").sub(msg => {
      try { expect(msg.content).to.eql({ foo: "dlx + throw" }) }
      catch (e) { return reject(e) }
      resolve()
    })
    broker.queue("test.acknack.throw.dlx").sub(() => {
      expect(true).to.be.false
    })
    broker.exchange("test.acknack").pub("test.acknack.throw.dlx", { foo: "dlx + throw" })
  }))
  it("Should nack + deadletter if the handler rejects", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("dlx_test.acknack.rejects").sub(msg => {
      try { expect(msg.content).to.eql({ foo: "dlx + reject" }) }
      catch (e) { return reject(e) }
      resolve()
    })
    broker.queue("test.acknack.rejects.dlx").sub(() => {
      return Promise.reject()
    })
    broker.exchange("test.acknack").pub("test.acknack.rejects.dlx", { foo: "dlx + reject" })
  }))
  it("Should nack + deadletter if the handler calls next(false)", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("dlx_test.acknack.next.false").sub(msg => {
      try { expect(msg.content).to.eql({ foo: "dlx + false" }) }
      catch (e) { return reject(e) }
      resolve()
    })
    broker.queue("test.acknack.next.false.dlx").sub((_, next) => {
      next(false)
    })
    broker.exchange("test.acknack").pub("test.acknack.next.false.dlx", { foo: "dlx + false" })
  }))
  it("Should nack + deadletter if the handler calls next(error)", () => new Promise<void>(async (resolve, reject) => {
    broker.queue("dlx_test.acknack.next.error").sub(msg => {
      try { expect(msg.content).to.eql({ foo: "dlx + error" }) }
      catch (e) { return reject(e) }
      resolve()
    })
    broker.queue("test.acknack.next.error.dlx").sub((_, next) => {
      next(new Error("e"))
    })
    broker.exchange("test.acknack").pub("test.acknack.next.error.dlx", { foo: "dlx + error" })
  }))
})