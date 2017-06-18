const util = require('util')
const winston = require('winston')
const amqp = require('amqplib')

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

  // while publish == null, logs will be buffered
  this.publish = null

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
      ch.assertExchange(this.exchange, 'direct', this.exchangeOptions)
    })
})

// Inherit from `winston.Transport` to take advantage
// of the base functionality
util.inherits(AMQPTransport, winston.Transport)

AMQPTransport.prototype.log = function (level, msg, meta, callback) {
  // Store this message and metadata, maybe use some custom logic
  // then callback indicating success.
  callback(null, true)
}

module.exports = AMQPTransport
