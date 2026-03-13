import { GraphQLError } from 'graphql'
import { ClientError, GraphQLClient } from 'graphql-request'

import type { TrackerAttributes } from '../types/shopifyTypes'
import { shopifyGraphqlAdapter } from './shopifyGraphqlAdapter'

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

const SAMPLE_ATTRIBUTES: TrackerAttributes = {
  trackingNumber: 'VH1234567890',
  carrierId: 'gid://shopify/DeliveryCarrierService/456',
  events: [
    {
      status: 'OUT_FOR_DELIVERY',
      message: 'Package is out for delivery',
      happenedAt: '2026-02-27T10:00:00.000Z',
    },
  ],
}

describe('shopifyGraphqlAdapter.sendTrackerUpdate', () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_URL = 'https://shopify.example.com/graphql'
    process.env.SHOPIFY_ACCESS_TOKEN = 'test-token'
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.SHOPIFY_API_URL
    delete process.env.SHOPIFY_ACCESS_TOKEN
  })

  it('returns success: true on a successful GraphQL response', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { userErrors: [] } })

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_ATTRIBUTES, 'webhook-id-1', 'idem-key-1')

    expect(result.success).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('returns success: false with errors when userErrors is non-empty', async () => {
    mockRequest.mockResolvedValue({
      trackerUpdate: {
        userErrors: [{ field: 'carrierId', message: 'Invalid carrier' }],
      },
    })

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_ATTRIBUTES, 'webhook-id-1', 'idem-key-1')

    expect(result.success).toBe(false)
    expect(result.errors).toEqual([{ field: 'carrierId', message: 'Invalid carrier' }])
  })

  it('returns success: false on ClientError (GraphQL-level error)', async () => {
    const clientError = new ClientError({ errors: [new GraphQLError('Throttled')], status: 200 } as never, {
      query: '',
    })
    mockRequest.mockRejectedValue(clientError)

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_ATTRIBUTES, 'webhook-id-1', 'idem-key-1')

    expect(result.success).toBe(false)
    expect(result.errors?.[0].field).toBe('graphql')
    expect(result.errors?.[0].message).toContain('Throttled')
  })

  it('returns success: false on network error', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_ATTRIBUTES, 'webhook-id-1', 'idem-key-1')

    expect(result.success).toBe(false)
    expect(result.errors?.[0].message).toContain('ECONNREFUSED')
  })

  it('creates client with correct URL and headers', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { userErrors: [] } })

    await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_ATTRIBUTES, 'wh-id', 'idem-key')

    expect(GraphQLClient).toHaveBeenCalledWith('https://shopify.example.com/graphql', {
      headers: { 'X-Shopify-Access-Token': 'test-token' },
    })
  })

  it('passes variables correctly to request', async () => {
    mockRequest.mockResolvedValue({ trackerUpdate: { userErrors: [] } })

    await shopifyGraphqlAdapter.sendTrackerUpdate(SAMPLE_ATTRIBUTES, 'wh-id', 'idem-key')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        trackerAttributes: SAMPLE_ATTRIBUTES,
        webhookId: 'wh-id',
        idempotencyKey: 'idem-key',
      })
    )
  })
})
