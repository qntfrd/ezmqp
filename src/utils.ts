import stringify from "fast-safe-stringify"
import { nanoid } from "nanoid"
import { MsgOptions } from "./types"

const fss = (obj: any) => {
  try { return JSON.stringify(obj) }
  catch { return stringify(obj) }
}

/** Prepares a message to be send to a queue or exchange
 *
 *  @param message - The message to send. If it is an object, and no
 *  options.contentType is set, the message will be stringified in json, using
 *  {@link https://npmjs.org/fast-safe-stringify fast-safe-stringify} and the
 *  content-type will be set to `application/json`, so that the consumer will
 *  be able to parse it properly
 *  If the message is a buffer, no content-type will be set
 *  @param options - Some options
 */
export function prepareMessage(message: Object|Buffer, options: MsgOptions = {}): [Buffer, MsgOptions] {
  const opts: MsgOptions = {
    messageId: nanoid(),
    timestamp: Date.now(),
    appId: process.env.npm_package_name,
    ...options
  }
  if (Buffer.isBuffer(message))
    return [message, opts]
  if (options.contentType && options.contentType !== "application/json")
    return [Buffer.from(fss(message)), opts]
  opts.contentType = "application/json"
  return [Buffer.from(fss(message)), opts]
}
