import { expect } from "chai"
import { Connection } from "../src/types"
import { Rabbit } from "../src"

type ConnectionOpts = {
  protocol?: string
  hostname?: string
  port?: number|string
  username?: string
  password?: string
  locale?: string
  frameMax?: number|string
  channelMax?: number|string
  heartbeat?: number|string
  vhost?: string
}

const makeCS = (obj: ConnectionOpts): string => {
  let cs = `${obj.protocol ?? "amqp"}://`
  if (obj.username !== undefined && obj.password !== undefined)
    cs += `${obj.username}:${obj.password}@`
  else if (obj.username !== undefined)
    cs += `${obj.username}@`
  cs += obj.hostname ?? 'localhost'
  if (obj.port !== undefined)
    cs += `:${obj.port}`
  cs += obj.vhost ?? ""

  const params = [
    ...(obj.locale !== undefined ? [`locale=${obj.locale}`] : []),
    ...(obj.frameMax !== undefined ? [`frameMax=${obj.frameMax}`] : []),
    ...(obj.channelMax !== undefined ? [`channelMax=${obj.channelMax}`] : []),
    ...(obj.heartbeat !== undefined ? [`heartbeat=${obj.heartbeat}`] : []),
  ]
  if (params.length > 0)
    cs += `?${params.join("&")}`
  return cs
}
const makeExpectCS = (obj: ConnectionOpts): string => {
  const cs = `${
    obj.protocol === "amqps" ? "amqps" : "amqp"
  }://${
    !!obj.username ? obj.username : "guest"
  }:****@${
    !!obj.hostname ? obj.hostname : "localhost"
  }:${
    obj.port !== undefined && obj.port !== "" ? obj.port : 5672
  }${
    !!obj.vhost ? obj.vhost : "/"
  }`
  const params = [
    ...(obj.frameMax === "" || obj.frameMax === undefined || obj.frameMax == 0 ? [] : [`frameMax=${obj.frameMax}`]),
    ...(obj.channelMax === "" || obj.channelMax === undefined || obj.channelMax == 0 ? [] : [`channelMax=${obj.channelMax}`]),
    ...(obj.heartbeat === "" || obj.heartbeat === undefined || obj.heartbeat == 0 ? [] : [`heartbeat=${obj.heartbeat}`]),
  ]
  if (params.length > 0) return `${cs}?${params.join("&")}`
  return cs
}

describe("Rabbit", () => {
  const connectionTests = [
    ["empty connection string", , "amqp://guest:****@localhost:5672/"],
    ["simple connection string", "amqp://foo:bar@baz", "amqp://foo:****@baz:5672/"],
    ["simple connection object", { protocol: "amqps" } as Connection, "amqps://guest:****@localhost:5672/"],
    ["array of connection string", ["amqp://foo", "amqp://bar", "amqp://baz"], "amqp://guest:****@foo:5672/,amqp://guest:****@bar:5672/,amqp://guest:****@baz:5672/"],
    ["array of connection object", [{ hostname: "foo" } as Connection, { hostname: "bar" } as Connection, { hostname: "baz" } as Connection], "amqp://guest:****@foo:5672/,amqp://guest:****@bar:5672/,amqp://guest:****@baz:5672/"],
    ["array of mixed connection", [{ hostname: "foo" } as Connection, "amqp://bar", { hostname: "baz" } as Connection], "amqp://guest:****@foo:5672/,amqp://guest:****@bar:5672/,amqp://guest:****@baz:5672/"],
    ["connection string with coma", "amqp://foo,amqp://bar,amqp://baz", "amqp://guest:****@foo:5672/,amqp://guest:****@bar:5672/,amqp://guest:****@baz:5672/"],
  ]
  for (const test of connectionTests) {
    it(`Should allow ${test[0]} in parameters`, () => {
      const broker = new Rabbit(test[1])
      expect(broker.nodes + "").to.eql(test[2])
    })
    it(`Shoudl allow ${test[0]} in configuration`, () => {
      const broker = new Rabbit({ connection: test[1] })
      expect(broker.nodes + "").to.eql(test[2])
    })
  }

  const tests = {
    protocol: [[,"amqp", "amqps", ""], ["http", "https"], "Invalid protocol '%s'"],
    port: [[,0, "123", 123, 65535], [-1, "foo", 999999], "Invalid port '%s'"],
    username: [[,"","foo"], [], ""],
    password: [[,"","bar"], [], ""],
    channelMax: [[,0, "12", 2**16-1], [-1, "bar", 2**16], "Invalid channelMax '%s'. Expected range between 0 and 2^16-1"],
    frameMax: [[,0, "12", 2**32-1], [-1, "bar", 2**32], "Invalid frameMax '%s'. Expected range between 0 and 2^32-1"],
    heartbeat: [[,0, "12"], [-1, "bar"], "Invalid heartbeat '%s'. Expected range between 0 and 2^32-1"],
    vhost: [[, "", "/plop", "/"], ["a"], "Invalid vhost '%s'. Must start with '/'"]
  }

  for (const key in tests) {
    for (const accept of (tests as any)[key][0]) {
      it(`Should accept '${accept}' as ${key} when parametered from an object`, () => {
        const broker = new Rabbit({[key]: accept})
        expect(`${broker.nodes[0]}`).to.equal(makeExpectCS({[key]: accept}))
      })
      if (key === "protocol" && accept === "") continue
      it(`Should accept '${accept}' as ${key}`, () => {
        const broker = new Rabbit(makeCS({[key]: accept}))
        expect(`${broker.nodes[0]}`).to.equal(makeExpectCS({[key]: accept}))
      })
    }
    for (const reject of (tests as any)[key][1]) {
      it(`Should reject '${reject}' as ${key} when parametered from an object`, () => {
        try {
          new Rabbit({[key]: reject})
          return Promise.reject("Should have thrown")
        }
        catch (e) {
          expect(e.message).to.equal((tests as any)[key][2].replace("%s", reject))
        }
      })
      if (key === "vhost") continue
      it(`Should reject '${reject}' as ${key}`, () => {
        try {
          new Rabbit(makeCS({[key]: reject}))
          return Promise.reject("Should have thrown")
        }
        catch (e) {
          if (key === "protocol" && reject === "")
            expect(e.message).to.equal("Invalid URL: ://localhost")
          if (key === "port")
            expect(e.message).to.equal(`Invalid URL: amqp://localhost:${reject}`)
          else
            expect(e.message).to.equal((tests as any)[key][2].replace("%s", reject))
        }
      })
    }
  }

  it("Should validate the configuration object")
  it("Should allow policies")
})
