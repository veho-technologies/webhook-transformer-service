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

  it('returns success: true on a successful GraphQL response', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { errors: [], idempotencyKey: 'idem-key-1' } })

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)

    expect(result.success).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('returns success: false with errors when errors is non-empty', async () => {
    mockRequest.mockResolvedValue({
      trackerUpdate: {
        errors: [{ code: 'INVALID', field: 'carrierId', message: 'Invalid carrier' }],
        idempotencyKey: null,
      },
    })

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)

    expect(result.success).toBe(false)
    expect(result.errors).toEqual([{ code: 'INVALID', field: 'carrierId', message: 'Invalid carrier' }])
  })

  it('returns success: false on ClientError (GraphQL-level error)', async () => {
    const clientError = new ClientError({ errors: [new GraphQLError('Throttled')], status: 200 } as never, {
      query: '',
    })
    mockRequest.mockRejectedValue(clientError)

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)

    expect(result.success).toBe(false)
    expect(result.errors?.[0].field).toBe('graphql')
    expect(result.errors?.[0].message).toContain('Throttled')
  })

  it('returns success: false on network error', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)

    expect(result.success).toBe(false)
    expect(result.errors?.[0].message).toContain('ECONNREFUSED')
  })

  it('creates client with correct URL and requestMiddleware', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { errors: [], idempotencyKey: 'idem-key-1' } })

    await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)

    expect(GraphQLClient).toHaveBeenCalledWith('https://shopify.example.com/graphql', {
      requestMiddleware: expect.any(Function),
    })
  })

  it('passes input variable correctly to request', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { errors: [], idempotencyKey: 'idem-key-1' } })

    await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_INPUT)

    expect(mockRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: SAMPLE_INPUT,
      })
    )
  })
})
