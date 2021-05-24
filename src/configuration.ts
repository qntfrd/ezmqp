import { InternalConfiguration, Connection, Configuration } from "./types"

/** Validates that a number is properly formated
 *
 *  @param value - The number to check
 *  @param fallback - If the value is not set, set fallback as its value
 *  @param min - The minimum accepted value
 *  @param max - The maximum accepted value
 *  @param err - The error message to throw if the number is not valid
 *
 *  **NB**
 *  - A number is considered valid if its value can be coerced in a number between min and max
 *  - The error message can have ONE %s which will be replaced by the value that was provided
 *
 *  @throw `Invalid number %s.` (or overrides)
 */
const validateNumber = (
  value: string|number|null|undefined,
  fallback: number = 0,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  err = "Invalid number '%s'."
): number => {
  if (value === undefined || value === null || value === "") return fallback
  if (Number.isNaN(Number(value)) || Number(value) != value)
    throw new Error(err.replace("%s", value + ""))
  const v = Number(value)
  if (v < min || v > max)
    throw new Error(err.replace("%s", value + ""))
  return v
}

/** Ensures the connectio object is properly formated with all values set
 *  This also makes sure all default fields are actually set, or sets them otherwise
 *
 *  @param connection Some connection to validate
 *  @returns A properly formated connection
 *
 *  @throws "Invalid protocol '%s'"
 *  @throws "Invalid port '%s'"
 *  @throws "Invalid channel '%s'. Expected range between 0 and 2^16-1"
 *  @throws "Invalid frameMax '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid heartbeat '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid vhost '%s'. Must start with '/'
 */
const validateConnection = (connection: Partial<Connection>): Required<Connection> => {

  const co: Required<Connection> = {
    protocol: ((): "amqp"|"amqps" => {
      if  (!connection.protocol) return "amqp"
      if (connection.protocol === "amqps") return "amqps"
      if (connection.protocol === "amqp") return "amqp"
      throw new Error(`Invalid protocol '${connection.protocol}'`)
    })(),

    hostname: connection.hostname ?? "localhost",
    username: !!connection.username ? connection.username : "guest",
    password: !!connection.username ? connection.password : "guest",

    port: validateNumber(connection.port, 5672, 0, 65535, "Invalid port '%s'"),
    channelMax: validateNumber(connection.channelMax, 0, 0, 2**16-1, "Invalid channelMax '%s'. Expected range between 0 and 2^16-1"),
    frameMax: validateNumber(connection.frameMax, 0, 0, 2**32-1, "Invalid frameMax '%s'. Expected range between 0 and 2^32-1"),
    heartbeat: validateNumber(connection.heartbeat, 0, 0, 2**32-1, "Invalid heartbeat '%s'. Expected range between 0 and 2^32-1"),

    locale: connection.locale ?? "en_US",
    vhost: !!connection.vhost ? connection.vhost : "/"
  }

  if (co.vhost[0] !== "/") throw new Error(`Invalid vhost '${co.vhost}'. Must start with '/'`)

  return co
}

/** Transforms a connection string to a VALID connection object
 *
 *  @param connection - The connection string to parse
 *  @returns A connection object with all its fields filled
 *
 *  @throws "Invalid protocol '%s'"
 *  @throws "Invalid port '%s'"
 *  @throws "Invalid channel '%s'. Expected range between 0 and 2^16-1"
 *  @throws "Invalid frameMax '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid heartbeat '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid vhost '%s'. Must start with '/'
 */
const connectionStringToObject = (connectionString: string): Required<Connection> => {
  const url = new URL(connectionString)
  const params = Object.fromEntries(url.searchParams.entries())

  return validateConnection({
    protocol: url.protocol.slice(0, -1) as "amqp"|"amqps",
    hostname: !url.hostname ? "localhost" : url.hostname,
    username: !url.username ? "guest" : url.username,
    password: !url.password ? "guest" : url.password,
    port: !url.port ? 5672 : Number(url.port),
    // `as any as number` is to pass down any string to the validation to have nice errors
    channelMax: params.channelMax as any as number ?? 0,
    frameMax: params.frameMax as any as number ?? 0,
    heartbeat: params.heartbeat as any as number ?? 0,
    locale: "en_US",
    vhost: !url.pathname ? "/" : url.pathname
  })
}

/** Validates a connection string and transforms it into a VALID connection
 *  object
 *
 *  @param connectionString - The connection string to parse
 *  @returns - An array of valid connection object
 *
 *  @throws "Invalid protocol '%s'"
 *  @throws "Invalid port '%s'"
 *  @throws "Invalid channel '%s'. Expected range between 0 and 2^16-1"
 *  @throws "Invalid frameMax '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid heartbeat '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid vhost '%s'. Must start with '/'
 */
export const parseConnectionString = (connectionString: string = "amqp://localhost"): Array<Required<Connection>> => {
  if (connectionString.includes(","))
    return connectionString.split(",").map(connectionStringToObject)
  return [connectionStringToObject(connectionString)]
}


const isConnection = (
  connection: Configuration|Connection|string|Array<Connection|string>
): boolean => {
  return (typeof connection === "object" && (
    connection.hasOwnProperty("protocol")
    || connection.hasOwnProperty("hostname")
    || connection.hasOwnProperty("username")
    || connection.hasOwnProperty("password")
    || connection.hasOwnProperty("port")
    || connection.hasOwnProperty("channelMax")
    || connection.hasOwnProperty("frameMax")
    || connection.hasOwnProperty("heartbeat")
    || connection.hasOwnProperty("vhost")
  ))
}

/** Parse the connection parameters from the Rabbit constructor
 *
 *  @throws "Invalid protocol '%s'"
 *  @throws "Invalid port '%s'"
 *  @throws "Invalid channel '%s'. Expected range between 0 and 2^16-1"
 *  @throws "Invalid frameMax '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid heartbeat '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid vhost '%s'. Must start with '/'
 */
const getConnections = (
  connection?: Configuration|Connection|string|Array<Connection|string>
): Array<Required<Connection>> => {
  if (connection === null || connection === undefined || typeof connection === "string")
    return parseConnectionString(connection as string)
  else if (Array.isArray(connection)) {
    return connection.map(co => {
      if (typeof co === "string") return parseConnectionString(co)
      else return validateConnection(co)
    }).flat()
  }
  else if (isConnection(connection))
    return [validateConnection(connection as Connection)]
  else if (connection.hasOwnProperty("connection")) {
    return getConnections((connection as Configuration).connection)
  }
}

/** This retruns a properly formated configuration
 *
 *  @param connection - The possible connection configuration
 *  @param configuration - The possible configuration
 *  @returns The actual configuration
 *
 *  @throws "Invalid protocol '%s'"
 *  @throws "Invalid port '%s'"
 *  @throws "Invalid channel '%s'. Expected range between 0 and 2^16-1"
 *  @throws "Invalid frameMax '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid heartbeat '%s'. Expected range between 0 and 2^32-1"
 *  @throws "Invalid vhost '%s'. Must start with '/'
 */
export const loadConfiguration = (
  connection?: Connection|Configuration|string|Array<Connection|string>,
  configuration?: Configuration
): InternalConfiguration => {
  return { ...configuration, connection: getConnections(connection) }
}