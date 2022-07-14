import amqp from "amqplib"
import { Rabbit } from "./rabbit"
import { ExchangeConfig, QueueConfig, MsgOptions, ConsumerOptions } from "./types"

/** One to one mapping with amqplib's channel */
export class Channel {
  //#region private properties
  /** The actual channel */
  private _channel: amqp.Channel | null = null
  /** Whether the channel was manually closed */
  private closing = false
  //#endregion

  /** Creates the channel
   *
   *  @param client - The `AMQP` connection
   */
  constructor(private client: Rabbit) {}

  //#region open/close
  /** Opens the channel */
  async connect(): Promise<Channel> {
    if (this._channel) return this
    if (!this.client.connected) await this.client.connect()
    this._channel = await this.client.connection.createChannel()
    this.closing = false
    this._channel.on("close", () => this.onClose())
    // TODO: on return
    // TODO: on error
    // TODO: on drain
    return this
  }

  /** Closes the channe */
  async close() {
    if (!this._channel) return
    this.closing = true
    await this._channel.close()
  }

  private onClose() {
    this._channel = null
    if (this.closing || !this.client.connected) return
    return this.connect()
  }
  //#endregion

  //#region getters
  /** Gets the channel (or throws if the channel is not opened)
   *
   *  @throws `Channel not opened` - If the channel is not opened
   */
  get channel() {
    if (this._channel) return this._channel
    throw new Error("Channel not opened")
  }

  /** Gets whether the channel is opened */
  get connected() { return !!this._channel }
  //#endregion

  //#region amqplib mapping
  /** Assert a queue into existence.
   *
   *  This operation is idempotent given identical arguments; however, it will
   *  bork the channel if the queue already exists but has different properties
   *  (values supplied in the arguments field may or may not count for borking
   *  purposes; check the borker’s, I mean broker’s, documentation).
   *
   *  @param queue - if you supply an empty string or other falsey value
   *  (including null and undefined), the server will create a random name for
   *  you.
   *  @param options - is an object and may be empty or null, or outright
   *  omitted if it’s the last argument.
   */
  async assertQueue(name: string, options: QueueConfig = {}): Promise<any> {
    return await this.channel.assertQueue(name, options)
  }

  /** Delete named queue
   *
   *  Naming a queue that doesn’t exist will result in the server closing the
   *  channel, to teach you a lesson (except in RabbitMQ version 3.2.0 and
   *  after).
   *
   *  @param options.ifUnused if true and the queue has consumers, it will not
   *  be deleted and the channel will be closed. Defaults to false.
   *  @param options.ifEmpty: if true and the queue contains messages, the queue
   *  will not be deleted and the channel will be closed. Defaults to false.
   *
   *  Note the obverse semantics of the options: if both are true, the queue
   *  will be deleted only if it has no consumers and no messages.
   *
   *  You should leave out the options altogether if you want to delete the
   *  queue unconditionally.
   */
  async deleteQueue(queue: string, options?: { ifUnused?: boolean, ifEmpty?: boolean }): Promise<any> {
    return await this.channel.deleteQueue(queue, options)
  }

  /** Remove all undelivered message from the queue
   *
   *  Note that this won’t remove messages that have been delivered but not yet
   *  acknowledged; they will remain, and may be requeued under some
   *  circumstances (e.g., if the channel to which they were delivered closes
   *  without acknowledging them).
   */
  async purgeQueue(queue: string): Promise<any> {
    return await this.channel.purgeQueue(queue)
  }

  /** Assert a routing path from an exchange to a queue
   *
   *  The exchange named by source will relay messages to the queue named,
   *  according to the type of the exchange and the pattern given.
   *  The [RabbitMQ tutorials](http://www.rabbitmq.com/getstarted.html) give a
   *  good account of how routing works in AMQP.
   *
   *  @param queue - The name of the queue to bind...
   *  @param exchange - ...to the exchange named `exchange`
   *  @param routingKey - according to the `routingKey` rule
   *  @param args - extra arguments that may be required for the particular
   *  exchange type (for which, see [your server’s documentation](http://www.rabbitmq.com/documentation.html)).
   *  It may be omitted if it’s the last argument, which is equivalent to an
   *  empty object.
   */
  async bindQueue(queue: string, exchange: string, routingKey: string, args?: any): Promise<any> {
    return await this.channel.bindQueue(queue, exchange, routingKey, args)
  }

  /** Remove routing between the queue and the exchange for the routingKey with
   *  arguments given.
   *
   *  Omitting args is equivalent to supplying an empty object (no arguments).
   *  @warn attempting to unbind when there is no such binding may result in a
   *  punitive error (the AMQP specification says it’s a connection-killing
   *  mistake; RabbitMQ before version 3.2.0 softens this to a channel error,
   *  and from version 3.2.0, doesn’t treat it as an error at all).
   *
   *  @param queue - The targeted queue
   *  @param exchange - The targeted exchange
   *  @param routingKey - The routing to remove
   *  @param args - Some extra arguments
   */
  async unbindQueue(queue: string, exchange: string, routingKey: string, args?: any): Promise<any> {
    return await this.channel.unbindQueue(queue, exchange, routingKey, args)
  }

  /** Assert an exchange into existence.
   *
   *  As with queues, if the exchange exists already and has properties
   *  different to those supplied, the channel will ‘splode; fields in the
   *  arguments object may or may not be ‘splodey, depending on the type of
   *  exchange. Unlike queues, you must supply a name, and it can’t be the empty
   *  string. You must also supply an exchange type, which determines how
   *  messages will be routed through the exchange.
   *
   *  @note There is just one RabbitMQ extension pertaining to exchanges in
   *  general (alternateExchange);
   *  however, specific exchange types may use the arguments table to supply
   *  parameters.
   *
   * @param name - The name of the exchange to create
   * @param type - The type of exchange
   * @param options - Some options
   */
  async assertExchange(name: string, type: "fanout"|"direct"|"topic"|"header", options: ExchangeConfig = {}): Promise<{ exchange: string }> {
    return await this.channel.assertExchange(name, type, options)
  }

  /** Checks wether the exchange exists
   *
   *  @param name - The name of the exchange to check
   */
  async checkExchange(name: string): Promise<any> {
    return await this.channel.checkExchange(name)
  }

  /** Deletes an exchange
   *
   *  @param name - The name of the exchange to delete
   *  @param options.ifUnused - If true and the exchanges has bindings, it will
   *  not be deleted
   */
  async deleteExchange(name: string, options?: { ifUnused: boolean }): Promise<any> {
    return await this.channel.deleteExchange(name, options)
  }

  /** Bind an exchange to another exchange
   *
   *  @warn Exchange to exchange binding is a RabbitMQ extension.
   *
   *  The exchange named by destination will receive messages from the exchange
   *  named by source, according to the type of the source and the pattern given
   *
   *  For example, a direct exchange will relay messages that have a routing key
   *  equal to the pattern.
   *
   *  @param destination - The exchange that will receive messages
   *  @param source - The exchange that will forward messages
   *  @param pattern - The pattern to match
   *  @param args - Some argyuments
   */
  async bindExchange(destination: string, source: string, pattern: string, args?: any): Promise<any> {
    return await this.channel.bindExchange(destination, source, pattern, args)
  }

  /** Removes bindings between exchanges
   *
   *  A binding with the exact source exchange, destination exchange, routingKey
   *  pattern, and extension args will be removed.
   */
  async unbindExchange(destination: string, source: string, pattern: string, args?: any): Promise<any> {
    return this.channel.unbindExchange(destination, source, pattern, args)
  }

  /** Publish a message to an exchange
   *
   *  @note If `exchange === ""`, the message will be sent directly to the queue
   *  named `routingKey`
   *
   *  @param exchange - The exchange to send the message to
   *  @param routingKey - How must the exchange route the message
   *  @param content - Message content
   *  @param options - Some options
   */
  publish(exchange: string, routingKey: string, content: Buffer, options: MsgOptions = {}) {
    return this.channel.publish(exchange, routingKey, content, options)
  }

  /** Send a single message to a specific queue
   *
   *  @param queue - The queue to send messages to
   *  @param content - The message content
   *  @param options - Some options
   */
  sendToQueue(queue: string, content: Buffer, options: MsgOptions = {}) {
    return this.channel.sendToQueue(queue, content, options)
  }

  /** Set up a consumer with a callback to be invoked with each message.
   *
   *  @param queue - The queue to subscribe to
   *  @param hdl - The callback that will receive messages
   *  @param options - Some options
   */
  async consume(
    queue: string,
    hdl: (msg: amqp.ConsumeMessage|null) => void,
    options: ConsumerOptions = {}
  ): Promise<{ consumerTag: string }> {
    return await this.channel.consume(queue, hdl, options)
  }

  /** Stop sending messages to that consumer
   *
   *  Messages may arrive between sending this and getting its reply.
   *  Once the reply has resolved, however, there will be no more messages for
   *  the consumer, i.e., the message callback will no longer be invoked.
   *
   *  The consumerTag is the string given in the reply to #consume,
   *  which may have been generated by the server.
   */
  async cancel(consumerTag: string): Promise<any> {
    return await this.channel.cancel(consumerTag)
  }

  /** Reads one message from the queue
   *
   *  @param queue - The queue to read
   *  @param options.noAck - if true, the message will be considered acked.
   *  Otherwise you'll have to ack it yourself
   *  @return false if there are no messages on top of the queue, the message otherwise
   */
  async get(queue: string, options?: { noAck: boolean }): Promise<false|amqp.GetMessage> {
    return await this.channel.get(queue, options)
  }

  /** Acknowledge the given message
   *
   *  If a #consume or #get is issued with noAck: false (the default),
   *  the server will expect acknowledgements for messages before forgetting
   *  about them.
   *  If no such acknowledgement is given, those messages may be requeued once
   *  the channel is closed.
   *
   *  If allUpTo is true, all outstanding messages prior to and including the
   *  given message shall be considered acknowledged.
   *  If false, or omitted, only the message supplied is acknowledged.
   *
   *  It’s an error to supply a message that either doesn’t require
   *  acknowledgement, or has already been acknowledged.
   *  Doing so will errorise the channel.
   *  If you want to acknowledge all the messages and you don’t have a specific
   *  message around, use #ackAll.
   *
   *  @param msg - The message to ack
   *  @param allUpTo - Acknowledge all messages (prior to and including this one)
   */
  ack(msg: amqp.Message, allUpTo: boolean = false) {
    return this.channel.ack(msg, allUpTo)
  }

  /** Acknowledge all messages */
  ackAll() {
    return this.channel.ackAll()
  }

  /** Reject given message
   *
   *  @note This (and {@link nackAll}) use a [Rabbit MQ extension](http://www.rabbitmq.com/nack.html)
   *
   *  This instructs the server to either requeue the message or throw it away
   *  which may result in it being dead-lettered.
   *
   *  If allUpTo is truthy, all outstanding messages prior to and including the
   *  given message are rejected.
   *  As with #ack, it’s a channel-ganking error to use a message that is not
   *  outstanding.
   *
   *  If requeue is truthy, the server will try to put the message or messages
   *  back on the queue or queues from which they came. Defaults to true,
   *  so if you want to make sure messages are dead-lettered or discarded,
   *  supply false here.
   *
   *  @param msg - The message to reject
   *  @param allUpTo - Reject all messages (prior to and including this one)
   *  @param requeue - Place the message back into its queue
   */
  nack(msg: amqp.ConsumeMessage, allUpTo: boolean = false, requeue: boolean = true) {
    return this.channel.nack(msg, allUpTo, requeue)
  }

  /** Reject all messages on this channel
   *
   *  @param requeue - Try to requeue all messages
   */
  nackAll(requeue: boolean = true) {
    return this.channel.nackAll(requeue)
  }

  /** Equivalent of `#nack(message, false, requeue)` but for older rabbit versions */
  reject(messages: amqp.Message, requeue: boolean = true) {
    return this.channel.reject(messages, requeue)
  }

  /** Sets the prefetch count for this channel
   *
   *  @param count - Maximum number of messages sent over the channel that can
   *  be awaiting acknowledgement; once there are count messages outstanding,
   *  the server will not send more messages on this channel until one or more
   *  have been acknowledged. A falsey value for count indicates no such limit.
   */
  async prefetch(count: number): Promise<any> {
    return await this.channel.prefetch(count)
  }

  /** Requeue unacknowledge messages */
  async recover(): Promise<any> {
    return await this.channel.recover()
  }
  //#endregion
}