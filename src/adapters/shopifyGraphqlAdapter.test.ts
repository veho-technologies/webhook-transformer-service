import { RetryableError } from '@veho/lambda-utils'
import { GraphQLError } from 'graphql'
import { ClientError, GraphQLClient } from 'graphql-request'

import type { TrackerAttributes } from '../types/shopifyTypes'
import { resetCachedHmacSecret, shopifyGraphqlAdapter } from './shopifyGraphqlAdapter'

jest.mock('graphql-request', () => {
  const actual = jest.requireActual('graphql-request')
  return {
    ...actual,
    GraphQLClient: jest.fn(),
  }
})

const mockRequest = jest.fn()
;(GraphQLClient as jest.MockedClass<typeof GraphQLClient>).mockImplementation(
  () => ({ request: mockRequest }) as unknown as GraphQLClient
)

const SAMPLE_INPUT: TrackerAttributes = {
  idempotencyKey: 'idem-key-1',
  trackerReferenceId: 'ref-001',
  trackingNumber: 'VH1234567890',
  carrierId: 'gid://shopify/DeliveryCarrierService/456',
  events: [
    {
      status: 'OUT_FOR_DELIVERY',
      message: 'Package is out for delivery',
      happenedAt: '2026-02-27T10:00:00.000Z',
      territory: 'US',
    },
  ],
}

describe('shopifyGraphqlAdapter.sendTrackerUpdate', () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_URL = 'https://shopify.example.com/graphql'
    process.env.SHOPIFY_HMAC_SECRET = 'test-secret'
    process.env.SHOPIFY_APP_ID = '123456'
    resetCachedHmacSecret()
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.SHOPIFY_API_URL
    delete process.env.SHOPIFY_HMAC_SECRET
    delete process.env.SHOPIFY_APP_ID
  })

  it('resolves on a successful GraphQL response', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { errors: [], idempotencyKey: 'idem-key-1' } })

    await expect(shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)).resolves.toBeUndefined()
  })

  it('throws on Shopify business errors', async () => {
    mockRequest.mockResolvedValue({
      trackerUpdate: {
        errors: [{ code: 'INVALID', field: 'carrierId', message: 'Invalid carrier' }],
        idempotencyKey: null,
      },
    })

    const err = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(RetryableError)
    expect(err.message).toContain('carrierId: Invalid carrier')
  })

  it('throws non-retryable error on 4xx ClientError', async () => {
    const clientError = new ClientError({ errors: [new GraphQLError('Throttled')], status: 200 } as never, {
      query: '',
    })
    mockRequest.mockRejectedValue(clientError)

    const err = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(RetryableError)
    expect(err.message).toContain('Throttled')
  })

  it('throws RetryableError on 5xx ClientError', async () => {
    const clientError = new ClientError({ errors: [new GraphQLError('Internal Server Error')], status: 503 } as never, {
      query: '',
    })
    mockRequest.mockRejectedValue(clientError)

    const err = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT).catch(e => e)
    expect(err).toBeInstanceOf(RetryableError)
    expect(err.message).toContain('Internal Server Error')
  })

  it('throws RetryableError on network error', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNREFUSED'))

    const err = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT).catch(e => e)
    expect(err).toBeInstanceOf(RetryableError)
    expect(err.message).toContain('ECONNREFUSED')
  })

  it('creates client with correct URL and requestMiddleware', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { errors: [], idempotencyKey: 'idem-key-1' } })

    await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)

    expect(GraphQLClient).toHaveBeenCalledWith('https://shopify.example.com/graphql', {
      requestMiddleware: expect.any(Function),
    })
  })

  it('passes normalized input variable to request', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { errors: [], idempotencyKey: 'idem-key-1' } })

    await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)

    const calledInput = mockRequest.mock.calls[0][1].input
    expect(calledInput.trackingNumber).toBe(SAMPLE_INPUT.trackingNumber)
    expect(calledInput.events[0].territory).toBe('US')
  })

  describe('message resolution', () => {
    beforeEach(() => {
      mockRequest.mockResolvedValue({ trackerUpdate: { errors: [], idempotencyKey: 'idem-key-1' } })
    })

    it('should preserve existing non-empty message', async () => {
      const input: TrackerAttributes = {
        ...SAMPLE_INPUT,
        events: [
          {
            status: 'OUT_FOR_DELIVERY',
            message: 'Package is out for delivery',
            happenedAt: '2026-02-27T10:00:00.000Z',
            territory: 'US',
            originalEventCode: 'pickedUpFromVeho',
          },
        ],
      }

      await shopifyGraphqlAdapter.sendTrackerUpdate(input)

      const normalized = mockRequest.mock.calls[0][1].input
      expect(normalized.events[0].message).toBe('Package is out for delivery')
    })

    it('should resolve message from supplementary map when originalEventCode matches', async () => {
      const input: TrackerAttributes = {
        ...SAMPLE_INPUT,
        events: [
          {
            status: 'DELAYED',
            message: '',
            happenedAt: '2026-02-27T10:00:00.000Z',
            territory: 'US',
            originalEventCode: 'delayed',
          },
        ],
      }

      await shopifyGraphqlAdapter.sendTrackerUpdate(input)

      const normalized = mockRequest.mock.calls[0][1].input
      expect(normalized.events[0].message).toBe('The package has been delayed')
    })

    it('should resolve message from Anansi when originalEventCode is known but not in supplementary', async () => {
      const input: TrackerAttributes = {
        ...SAMPLE_INPUT,
        events: [
          {
            status: 'IN_TRANSIT',
            message: '',
            happenedAt: '2026-02-27T10:00:00.000Z',
            territory: 'US',
            originalEventCode: 'droppedOffAtVeho',
          },
        ],
      }

      await shopifyGraphqlAdapter.sendTrackerUpdate(input)

      const normalized = mockRequest.mock.calls[0][1].input
      expect(normalized.events[0].message).toBe('Package arrived at Veho facility')
    })

    it('should use supplementary override over Anansi for overridden event codes', async () => {
      const input: TrackerAttributes = {
        ...SAMPLE_INPUT,
        events: [
          {
            status: 'IN_TRANSIT',
            message: '',
            happenedAt: '2026-02-27T10:00:00.000Z',
            territory: 'US',
            originalEventCode: 'pickedUpFromClient',
          },
        ],
      }

      await shopifyGraphqlAdapter.sendTrackerUpdate(input)

      const normalized = mockRequest.mock.calls[0][1].input
      expect(normalized.events[0].message).toBe('Package left sender facility')
    })

    it('should fall back to raw status when originalEventCode is unknown', async () => {
      const input: TrackerAttributes = {
        ...SAMPLE_INPUT,
        events: [
          {
            status: 'IN_TRANSIT',
            message: '',
            happenedAt: '2026-02-27T10:00:00.000Z',
            territory: 'US',
            originalEventCode: 'unknownEventCode',
          },
        ],
      }

      await shopifyGraphqlAdapter.sendTrackerUpdate(input)

      const normalized = mockRequest.mock.calls[0][1].input
      expect(normalized.events[0].message).toBe('IN_TRANSIT')
    })

    it('should fall back to raw status when no originalEventCode is present', async () => {
      const input: TrackerAttributes = {
        ...SAMPLE_INPUT,
        events: [
          {
            status: 'IN_TRANSIT',
            message: '',
            happenedAt: '2026-02-27T10:00:00.000Z',
            territory: 'US',
          },
        ],
      }

      await shopifyGraphqlAdapter.sendTrackerUpdate(input)

      const normalized = mockRequest.mock.calls[0][1].input
      expect(normalized.events[0].message).toBe('IN_TRANSIT')
    })
  })
})
