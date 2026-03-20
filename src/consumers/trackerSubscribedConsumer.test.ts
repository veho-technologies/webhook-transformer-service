import type { TrackingSubscriptionCreatedEvent } from '@veho/event-types'
import type { EventBridgeEvent } from 'aws-lambda'

import { transformationManager } from '../managers/transformationManager'
import { noopCallback, wrapInSqsEvent } from './testUtils'
import { handler } from './trackerSubscribedConsumer'

jest.mock('../managers/transformationManager', () => ({
  transformationManager: {
    processInitialSubscription: jest.fn(),
  },
}))

const mockProcessInitialSubscription = transformationManager.processInitialSubscription as jest.Mock

function buildEvent(
  overrides: Partial<TrackingSubscriptionCreatedEvent['payload']> = {}
): EventBridgeEvent<'TrackingSubscriptionCreated', TrackingSubscriptionCreatedEvent> {
  return {
    id: 'test-id',
    version: '0',
    account: '123456789',
    time: '2024-01-01T00:00:00Z',
    region: 'us-east-1',
    resources: [],
    source: 'veho.tracker',
    'detail-type': 'TrackingSubscriptionCreated',
    detail: {
      eventName: 'TrackingSubscriptionCreated',
      trigger: {
        source: 'Event',
        eventId: 'evt-001',
        initialEventId: 'evt-000',
      } as unknown as TrackingSubscriptionCreatedEvent['trigger'],
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
        trackingNumber: 'TRK-001',
        provider: 'shopify',
        providerDomain: 'mystore.myshopify.com',
        providerTrackerId: 'shopify-tracker-001',
        providerWebhookId: 'webhook-001',
        providerCarrierId: 'carrier-001',
        providerDestinationPostalCode: null,
        providerTest: false,
        ...overrides,
      },
    },
  }
}

describe('trackerSubscribedConsumer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls processInitialSubscription with trackingNumber, trackerReferenceId, and carrierId', async () => {
    await handler(wrapInSqsEvent(buildEvent()), {} as never, noopCallback)

    expect(mockProcessInitialSubscription).toHaveBeenCalledWith({
      trackingNumber: 'TRK-001',
      trackerReferenceId: 'shopify-tracker-001',
      carrierId: 'carrier-001',
    })
  })

  it('does not create subscription directly — processInitialSubscription handles it', async () => {
    await handler(wrapInSqsEvent(buildEvent()), {} as never, noopCallback)

    expect(mockProcessInitialSubscription).toHaveBeenCalledTimes(1)
  })

  it('returns batch item failure when handler errors', async () => {
    const error = new Error('Lugus failure')
    mockProcessInitialSubscription.mockRejectedValue(error)

    const result = await handler(wrapInSqsEvent(buildEvent()), {} as never, noopCallback)

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: 'test-message-id' }],
    })
  })
})
