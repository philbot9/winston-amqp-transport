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

  it('publishes log message without meta to AMQP', done => {
    const opts = {
      amqpConn: mockConn,
      name: 'test-name',
      exchange: 'test-exchange',
      routingKey: 'test-key',
      exchangeOptions: { ex: 'options' }
    }

    const level = 'info'
    const msg = 'test message'

    mockConn.createChannel.mockReturnValue(Promise.resolve(mockChannel))
    mockChannel.assertExchange.mockReturnValue(Promise.resolve())
    mockChannel.publish = jest.fn(() => Promise.resolve())

    const transport = new AMQPTransport(opts)

    process.nextTick(() => {
      transport.log(level, msg, () => {
        const args = mockChannel.publish.mock.calls[0]
        expect(args[0]).toBe(opts.exchange)
        expect(args[1]).toBe(opts.routingKey)

        const content = JSON.parse(args[2].toString())
        expect(content).toMatchObject({ name: opts.name, level, message: msg })
        done()
      })
    })
  })

  it('publishes log message with meta to AMQP', done => {
    const opts = {
      amqpConn: mockConn,
      name: 'test-name',
      exchange: 'test-exchange',
      routingKey: 'test-key',
      exchangeOptions: { ex: 'options' }
    }

    const level = 'info'
    const msg = 'test message'
    const meta = { meta: 'data' }

    mockConn.createChannel.mockReturnValue(Promise.resolve(mockChannel))
    mockChannel.assertExchange.mockReturnValue(Promise.resolve())
    mockChannel.publish = jest.fn(() => Promise.resolve())

    const transport = new AMQPTransport(opts)

    process.nextTick(() => {
      transport.log(level, msg, meta, () => {
        const args = mockChannel.publish.mock.calls[0]
        expect(args[0]).toBe(opts.exchange)
        expect(args[1]).toBe(opts.routingKey)

        const content = JSON.parse(args[2].toString())
        expect(content).toMatchObject({
          name: opts.name,
          level,
          message: msg,
          meta
        })
        done()
      })
    })
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

  it('publishes buffered log messages once connected', done => {
    const opts = {
      amqpConn: mockConn,
      name: 'test-name',
      exchange: 'test-exchange',
      routingKey: 'test-key',
      exchangeOptions: { ex: 'options' }
    }

    mockChannel.publish = jest.fn()

    mockConn.createChannel.mockReturnValue(Promise.resolve(mockChannel))
    mockChannel.assertExchange.mockReturnValue(Promise.resolve())

    const transport = new AMQPTransport(opts)
    transport.log('info', 'message3', () => {
      expect(transport.buffer.length).toBe(1)
      const logMessage = transport.buffer[0]
      expect(logMessage).toMatchObject({
        level: 'info',
        message: 'message3'
      })
    })
    transport.log('error', 'message4', () => {
      expect(transport.buffer.length).toBe(2)
      const logMessage = transport.buffer[1]
      expect(logMessage).toMatchObject({
        level: 'error',
        message: 'message4'
      })
    })

    process.nextTick(() => {
      const calls = mockChannel.publish.mock.calls

      expect(calls[0][0]).toBe(opts.exchange)
      expect(calls[0][1]).toBe(opts.routingKey)
      const content1 = JSON.parse(calls[0][2].toString())
      expect(content1).toMatchObject({
        level: 'info',
        message: 'message3'
      })

      expect(calls[1][0]).toBe(opts.exchange)
      expect(calls[1][1]).toBe(opts.routingKey)
      const content2 = JSON.parse(calls[1][2].toString())
      expect(content2).toMatchObject({
        level: 'error',
        message: 'message4'
      })

      done()
    })
  })
})
