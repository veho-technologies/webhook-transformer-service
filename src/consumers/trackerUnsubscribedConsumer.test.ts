import type { TrackingSubscriptionDeletedEvent } from '@veho/event-types'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { trackerSubscriptionManager } from '../managers/trackerSubscriptionManager'
import { handler } from './trackerUnsubscribedConsumer'

jest.mock('../dataAccessors/trackerSubscriptionDataAccessor', () => ({
  trackerSubscriptionDataAccessor: {
    listByClientId: jest.fn(),
  },
}))

jest.mock('../managers/trackerSubscriptionManager', () => ({
  trackerSubscriptionManager: {
    removeSubscription: jest.fn(),
  },
}))

const mockListByClientId = trackerSubscriptionDataAccessor.listByClientId as jest.Mock
const mockRemoveSubscription = trackerSubscriptionManager.removeSubscription as jest.Mock

function buildEvent(
  overrides: Partial<TrackingSubscriptionDeletedEvent['payload']> = {}
): EventBridgeEvent<'TrackingSubscriptionDeleted', TrackingSubscriptionDeletedEvent> {
  return {
    id: 'test-id',
    version: '0',
    account: '123456789',
    time: '2024-01-01T00:00:00Z',
    region: 'us-east-1',
    resources: [],
    source: 'veho.tracker',
    'detail-type': 'TrackingSubscriptionDeleted',
    detail: {
      eventName: 'TrackingSubscriptionDeleted',
      trigger: {
        source: 'Event',
        eventId: 'evt-001',
        initialEventId: 'evt-000',
      } as unknown as TrackingSubscriptionDeletedEvent['trigger'],
      tags: { Client: true },
      eventId: 'evt-001',
      eventDateTime: '2024-01-01T00:00:00.000Z',
      serviceName: 'test-service',
      commitHash: 'abc123',
      devTag: null,
      payload: {
        clientId: 'client-001',
        idempotencyKey: 'idem-001',
        referenceId: 'ref-001',
        provider: 'shopify',
        providerDomain: 'mystore.myshopify.com',
        providerTrackerId: 'shopify-tracker-001',
        providerWebhookId: 'webhook-001',
        providerCarrierId: 'carrier-001',
        providerTest: false,
        ...overrides,
      },
    },
  }
}

describe('trackerUnsubscribedConsumer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('looks up subscription by clientId and removes by trackingNumber', async () => {
    mockListByClientId.mockResolvedValue([
      {
        trackingNumber: 'TRK-001',
        trackerReferenceId: 'shopify-tracker-001',
        clientId: 'client-001',
        carrierId: 'carrier-001',
        subscribedAt: '2024-01-01T00:00:00Z',
      },
    ])

    await handler(buildEvent())

    expect(mockListByClientId).toHaveBeenCalledWith('client-001')
    expect(mockRemoveSubscription).toHaveBeenCalledWith('TRK-001')
  })

  it('warns and returns when no matching subscription found', async () => {
    mockListByClientId.mockResolvedValue([
      {
        trackingNumber: 'TRK-999',
        trackerReferenceId: 'other-tracker',
        clientId: 'client-001',
        carrierId: 'carrier-001',
        subscribedAt: '2024-01-01T00:00:00Z',
      },
    ])

    await handler(buildEvent())

    expect(mockRemoveSubscription).not.toHaveBeenCalled()
  })

  it('warns and returns when client has no subscriptions', async () => {
    mockListByClientId.mockResolvedValue([])

    await handler(buildEvent())

    expect(mockRemoveSubscription).not.toHaveBeenCalled()
  })

  it('lets errors propagate for EventBridge retry', async () => {
    const error = new Error('DynamoDB failure')
    mockListByClientId.mockRejectedValue(error)

    await expect(handler(buildEvent())).rejects.toThrow('DynamoDB failure')
  })
})
