const mockChannel = {
  assertExchange: jest.fn(() => Promise.resolve()),
  publish: jest.fn(() => Promise.resolve())
}

const mockConn = {
  createChannel: jest.fn(() => Promise.resolve(mockChannel))
}

const mockAmqp = {
  connect: jest.fn(() => Promise.resolve(mockConn))
}

jest.setMock('amqplib', mockAmqp)
const AMQPTransport = require('./amqp-transport')

describe('WinstonAMQPTransport', () => {
  afterEach(() => jest.resetAllMocks())

  it('uses default options if missing', () => {
    const options = { amqpConn: mockConn }
    const transport = new AMQPTransport(options)

    expect(transport.name).toBe('amqp-transport')
    expect(transport.level).toBe('info')
    expect(transport.exchange).toBe('logs')
    expect(transport.exchangeOptions).toEqual({
      durable: false,
      autoDelete: true
    })
    expect(transport.routingKey).toEqual('amqp-transport')
  })

  it('throws an error if neither amqpConn, nor amqpUrl are provided', () => {
    const options = { amqpUrl: null, amqpConn: null }
    expect(() => new AMQPTransport(options)).toThrowError(/amqp/i)
  })

  it('uses an existing AMQP connection if provided', done => {
    mockAmqp.connect.mockImplementation(() => {
      done('should not create a new connection')
    })

    mockConn.createChannel.mockImplementation(arg => {
      expect(arg).toBeUndefined()
      done()
    })

    new AMQPTransport({ amqpConn: mockConn })
  })

  it('sets up a new connection using amqpUrl', done => {
    const amqpUrl = 'amqp://somehost'

    mockAmqp.connect.mockImplementation(url => {
      expect(url).toEqual(amqpUrl)
      return Promise.resolve(mockConn)
    })

    mockConn.createChannel.mockImplementation(arg => {
      expect(arg).toBeUndefined()
      done()
      return Promise.resolve(mockChannel)
    })

    new AMQPTransport({ amqpUrl })
  })

  it('asserts an AMQP exchange', done => {
    const opts = {
      amqpConn: mockConn,
      exchange: 'test-exchange',
      exchangeOptions: { ex: 'options' }
    }

    mockConn.createChannel.mockReturnValue(Promise.resolve(mockChannel))
    mockChannel.assertExchange.mockImplementation((ex, topic, exOpts) => {
      expect(ex).toBe(opts.exchange)
      expect(topic).toBe('direct')
      expect(exOpts).toBe(opts.exchangeOptions)
      done()
    })

    new AMQPTransport(opts)
  })

  it('asserts an AMQP exchange', done => {
    const opts = {
      amqpConn: mockConn,
      exchange: 'test-exchange',
      exchangeOptions: { ex: 'options' }
    }

    mockConn.createChannel.mockReturnValue(Promise.resolve(mockChannel))
    mockChannel.assertExchange.mockImplementation((ex, topic, exOpts) => {
      expect(ex).toBe(opts.exchange)
      expect(topic).toBe('direct')
      expect(exOpts).toBe(opts.exchangeOptions)
      done()
    })

    new AMQPTransport(opts)
  })

  it('buffers log message while not connected', done => {
    const opts = {
      amqpConn: mockConn,
      exchange: 'test-exchange',
      exchangeOptions: { ex: 'options' }
    }

    mockConn.createChannel.mockImplementation(
      () => new Promise(() => {}) // never resolves
    )
    mockChannel.assertExchange.mockReturnValue(Promise.resolve())

    const transport = new AMQPTransport(opts)
    transport.log('info', 'message1', () => {
      expect(transport.buffer.length).toBe(1)
      const logMessage = transport.buffer[0]
      expect(logMessage).toMatchObject({
        level: 'info',
        message: 'message1'
      })
    })
    transport.log('error', 'message2', () => {
      expect(transport.buffer.length).toBe(2)
      const logMessage = transport.buffer[1]
      expect(logMessage).toMatchObject({
        level: 'error',
        message: 'message2'
      })
      done()
    })
  })
})
