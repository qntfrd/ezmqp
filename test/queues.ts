import { expect } from "chai"
import { Rabbit } from "../src"

describe("Queues", () => {
  const broker = new Rabbit({ connection: "amqp://admin:admin@localhost:5001/"})
  before(() => broker.connect())
  after(() => broker.close())

  it("Should be able to send a message on a queue", () => {
    return new Promise<void>(async (resolve, reject) => {
      const rand = Math.random()
      const queue = await broker.queue("test.queues.send-rec").assert()
      queue.sub<{hello: number}>(msg => {
        try {
          expect(msg.content.hello).to.eql(rand)
          resolve()
        } catch(e) {
          reject(e)
        }
      })
      queue.send({ hello: rand })
    })
  })
  it("Should assert deadletter exchanges if configured")
})