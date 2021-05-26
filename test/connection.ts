import sinon from "sinon";
import amqp from "amqplib"
import { expect } from "chai"
import { Rabbit } from "../src"

describe("Connection", () => {
  it("Should open/close a connection", async () => {
    const broker = new Rabbit("amqp://admin:admin@localhost:5001")
    expect(broker.connected).to.be.false
    await broker.connect()
    expect(broker.connected).to.be.true
    await broker.connect()
    expect(broker.connected).to.be.true
    await broker.close()
    expect(broker.connected).to.be.false
    await broker.close()
    expect(broker.connected).to.be.false
  })
  it("Should retry the connection to a single node cluster in case of failure (connect option)", async () => {
    sinon.spy(amqp, "connect")
    const broker = new Rabbit("amqp://foo")
    const now = Date.now()
    try {
      await broker.connect(5, 100)
      return Promise.reject(new Error("Should have thrown"))
    }
    catch (e) {
      expect(Date.now() - now).to.be.gte(500)
      expect(broker.connected).to.be.false
      expect((amqp.connect as any).callCount).to.be.eq(6)
    }
    finally {
      (amqp.connect as any).restore()
    }
  })
  it("Should retry the connection to a single node cluster in case of failure (connect policy)", async () => {
    sinon.spy(amqp, "connect")
    const broker = new Rabbit("amqp://foo", { connection: { retry: 5, frequency: 100 }})
    const now = Date.now()
    try {
      await broker.connect()
      return Promise.reject(new Error("Should have thrown"))
    }
    catch (e) {
      expect(Date.now() - now).to.be.gte(500)
      expect(broker.connected).to.be.false
      expect((amqp.connect as any).callCount).to.be.eq(6)
    }
    finally {
      (amqp.connect as any).restore()
    }
  })
  it("Should round robbin connections attempts", async () => {
    sinon.spy(amqp, "connect")
    const broker = new Rabbit("amqp://foo,amqp://bar,amqp://baz")
    try {
      await broker.connect(1)
      return Promise.reject(new Error("Should have thrown"))
    }
    catch (e) {
      expect((amqp.connect as any).callCount).to.be.eq(6)
      const attempts = new Array(6)
      for (let i = 0; i < 6; i++)
        attempts[i] = (amqp.connect as any).getCall(i).args[0].hostname
      expect(attempts).to.eql(["foo", "bar", "baz", "foo", "bar", "baz"])
    }
    finally {
      (amqp.connect as any).restore()
    }
  })

  it("Opening a channel should connect", async () => {
    const broker = new Rabbit("amqp://admin:admin@localhost:5001")
    expect(broker.connected).to.be.false
    await broker.channel("write").connect()
    expect(broker.connected).to.be.true
    expect(broker.channel("write").connected).to.be.true
  })
  it("Closing a channel should not disconnect", async () => {
    const broker = new Rabbit("amqp://admin:admin@localhost:5001")
    await broker.channel("write").connect()
    expect(broker.connected).to.be.true
    expect(broker.channel("write").connected).to.be.true
    await broker.channel("write").close()
    expect(broker.connected).to.be.true
    expect(broker.channel("write").connected).to.be.false
  })
  it("Closing a connection with opened channels should close channels", async () => {
    const broker = new Rabbit("amqp://admin:admin@localhost:5001")
    await broker.channel("write").connect()
    expect(broker.connected).to.be.true
    expect(broker.channel("write").connected).to.be.true
    await broker.close()
    expect(broker.connected).to.be.false
    expect(broker.channel("write").connected).to.be.false
  })

  it("Should reconnect to the server when the connection is lost", async () => {
    let connection: amqp.Connection | undefined
    const connect = sinon.stub(amqp, "connect")
      .callsFake((cs: string|amqp.Options.Connect, _?: any) => (amqp.connect as any).wrappedMethod(cs))
      .onFirstCall().callsFake((cs: string|amqp.Options.Connect, _?: any) => {
        const promise = (amqp.connect as any).wrappedMethod(cs)
        promise.then((co: amqp.Connection) => { connection = co })
        return promise
      })

    try {
      const broker = new Rabbit("amqp://admin:admin@localhost:5001")
      await broker.connect()
      expect(broker.connected).to.be.true
      await connection.close()
      expect(broker.connected).to.be.false
      expect(connect.callCount).to.eql(2)
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(broker.connected).to.be.true
    }
    finally {
      connect.restore()
    }
  })

  it("Should reconnect to the cluster when the connection is lost", async () => {
    let connection: amqp.Connection | undefined
    const connect = sinon.stub(amqp, "connect")
      .callsFake(() => { throw new Error("meh") })
      .onFirstCall().callsFake((cs: string|amqp.Options.Connect, _?: any) => {
        const promise = (amqp.connect as any).wrappedMethod(cs)
        promise.then((co: amqp.Connection) => { connection = co })
        return promise
      })
      .onCall(7).callsFake((cs: string|amqp.Options.Connect, _?: any) => (amqp.connect as any).wrappedMethod(cs))
    try {
      const broker = new Rabbit([
        "amqp://admin:admin@localhost:5001",
        "amqp://admin:admin@localhost:5002",
        "amqp://admin:admin@localhost:5003",
      ])
      await broker.connect()
      await (connection as amqp.Connection).close()
      expect(broker.connected).to.be.false
      expect((amqp.connect as any).callCount).to.eql(8)
      const arr = new Array(8)
      for (let i = 0; i < 8; i++)
        arr[i] = (amqp.connect as any).getCall(i).args[0].port
      expect(arr).to.eql([5001, 5001, 5002, 5003, 5001, 5002, 5003, 5001])
    } finally {
      connect.restore()
    }
  })
  it("Should reopen channels when the cluster connection is recovered", async () => {
    let connection: amqp.Connection | undefined
    const connect = sinon.stub(amqp, "connect")
      .callsFake((cs: string|amqp.Options.Connect, _?: any) => (amqp.connect as any).wrappedMethod(cs))
      .onFirstCall().callsFake((cs: string|amqp.Options.Connect, _?: any) => {
        const promise = (amqp.connect as any).wrappedMethod(cs)
        promise.then((co: amqp.Connection) => { connection = co })
        return promise
      })

    try {
      const broker = new Rabbit("amqp://admin:admin@localhost:5001")
      await broker.channel("write").connect()
      expect(broker.connected).to.be.true
      expect(broker.channel("write").connected).to.be.true
      await connection.close()
      expect(broker.connected).to.be.false
      expect(broker.channel("write").connected).to.be.false
      expect(connect.callCount).to.eql(2)
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(broker.connected).to.be.true
      expect(broker.channel("write").connected, "channel").to.be.true
    }
    finally {
      connect.restore()
    }
  })
  it("Should reopen a channel if the channel breaks", async () => {
    const broker = new Rabbit("amqp://admin:admin@localhost:5001")
    await broker.connect()
    await broker.channel("write").connect()
    expect(broker.channel("write").connected).to.be.true
    await broker.channel("write").channel.close()
    expect(broker.channel("write").connected).to.be.false
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(broker.channel("write").connected).to.be.true
  })

  it("Should assert the configuration")
})