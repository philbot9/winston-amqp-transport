const util = require('util')
const winston = require('winston')
const amqp = require('amqplib')
const os = require('os')

const hostname = os.hostname()

const defaultOptions = {
  name: 'amqp-transport',
  level: 'info',
  amqpUrl: 'amqp://localhost',
  exchange: 'logs',
  exchangeOptions: { durable: false, autoDelete: true },
  routingKey: 'amqp-transport'
}

const AMQPTransport = (winston.transports.AMQPTransport = function (
  clientOptions
) {
  const options = Object.assign({}, defaultOptions, clientOptions)

  if (!options.amqpConn && !options.amqpUrl) {
    throw new Error('Missing AMQP connection on options.amqpConn')
  }

  this.name = options.name
  this.level = options.level

  // AMQP options
  this.exchange = options.exchange
  this.exchangeOptions = options.exchangeOptions
  this.routingKey = options.routingKey

  this.buffer = []

  // set up AMQP connection
  const connection = options.amqpConn
    ? Promise.resolve(options.amqpConn)
    : amqp.connect(options.amqpUrl)

  connection
    .then(conn => {
      this.conn = conn
      return conn.createChannel()
    })
    .then(ch => {
      this.ch = ch
      return ch.assertExchange(this.exchange, 'direct', this.exchangeOptions)
    })
    .then(() => {
      Promise.all(this.buffer.map(this.publish.bind(this))).then(
        () => (this.buffer = [])
      )
    })
})

// Inherit from `winston.Transport` to take advantage
// of the base functionality
util.inherits(AMQPTransport, winston.Transport)

AMQPTransport.prototype.buildLogMessage = function (level, message, meta) {
  return {
    host: hostname,
    timestamp: Date.now(),
    name: this.name,
    level,
    message,
    meta
  }
}

AMQPTransport.prototype.publish = function (logMessage) {
  if (!this.ch) {
    return Promise.reject('No AMQP connection')
  }

  const content = Buffer.from(JSON.stringify(logMessage))

  return this.ch.publish(this.exchange, this.routingKey, content, {
    contentType: 'application/json',
    contentEncoding: 'utf8'
  })
}

AMQPTransport.prototype.log = function (level, msg, meta, callback) {
  if (typeof meta === 'function') {
    callback = meta
    meta = undefined
  }

  const logMessage = this.buildLogMessage(level, msg, meta)

  if (!this.ch) {
    // Not connected, buffering messages
    this.buffer.push(logMessage)
    callback(null, true)
  } else {
    this.publish(logMessage).then(callback(null, true)).catch(callback)
  }
}

module.exports = AMQPTransport
