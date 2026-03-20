import type { TrackingSubscriptionDeletedEvent } from '@veho/event-types'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { trackerSubscriptionManager } from '../managers/trackerSubscriptionManager'
import { noopCallback, wrapInSqsEvent } from './testUtils'
import { handler } from './trackerUnsubscribedConsumer'

jest.mock('../dataAccessors/trackerSubscriptionDataAccessor', () => ({
  trackerSubscriptionDataAccessor: {
    getByTrackerReferenceId: jest.fn(),
  },
}))

jest.mock('../managers/trackerSubscriptionManager', () => ({
  trackerSubscriptionManager: {
    removeSubscription: jest.fn(),
  },
}))

const mockGetByTrackerReferenceId = trackerSubscriptionDataAccessor.getByTrackerReferenceId as jest.Mock
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

  it('looks up subscription by trackerReferenceId and removes by trackingNumber', async () => {
    mockGetByTrackerReferenceId.mockResolvedValue({
      trackingNumber: 'TRK-001',
      trackerReferenceId: 'shopify-tracker-001',
      clientId: 'client-001',
      carrierId: 'carrier-001',
      subscribedAt: '2024-01-01T00:00:00Z',
    })

    await handler(wrapInSqsEvent(buildEvent()), {} as never, noopCallback)

    expect(mockGetByTrackerReferenceId).toHaveBeenCalledWith('shopify-tracker-001')
    expect(mockRemoveSubscription).toHaveBeenCalledWith('TRK-001')
  })

  it('warns and returns when no subscription found', async () => {
    mockGetByTrackerReferenceId.mockResolvedValue(undefined)

    await handler(wrapInSqsEvent(buildEvent()), {} as never, noopCallback)

    expect(mockRemoveSubscription).not.toHaveBeenCalled()
  })

  it('returns batch item failure when handler errors', async () => {
    const error = new Error('DynamoDB failure')
    mockGetByTrackerReferenceId.mockRejectedValue(error)

    const result = await handler(wrapInSqsEvent(buildEvent()), {} as never, noopCallback)

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: 'test-message-id' }],
    })
  })
})
