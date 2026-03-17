import type { TrackingSubscriptionCreatedEvent } from '@veho/event-types'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionManager } from '../managers/trackerSubscriptionManager'
import { transformationManager } from '../managers/transformationManager'
import { handler } from './trackerSubscribedConsumer'

jest.mock('../managers/trackerSubscriptionManager', () => ({
  trackerSubscriptionManager: {
    createSubscription: jest.fn(),
  },
}))

jest.mock('../managers/transformationManager', () => ({
  transformationManager: {
    processInitialSubscription: jest.fn(),
  },
}))

const mockCreateSubscription = trackerSubscriptionManager.createSubscription as jest.Mock
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

  it('creates subscription and sends initial history', async () => {
    await handler(buildEvent())

    expect(mockCreateSubscription).toHaveBeenCalledWith({
      trackingNumber: 'TRK-001',
      trackerReferenceId: 'shopify-tracker-001',
      carrierId: 'carrier-001',
      clientId: 'client-001',
      destinationPostalCode: undefined,
      subscribedAt: '2024-01-01T00:00:00.000Z',
    })

    expect(mockProcessInitialSubscription).toHaveBeenCalledWith({
      trackingNumber: 'TRK-001',
      trackerReferenceId: 'shopify-tracker-001',
      carrierId: 'carrier-001',
    })
  })

  it('passes destinationPostalCode when present', async () => {
    await handler(buildEvent({ providerDestinationPostalCode: '90210' }))

    expect(mockCreateSubscription).toHaveBeenCalledWith(expect.objectContaining({ destinationPostalCode: '90210' }))
  })

  it('calls processInitialSubscription after createSubscription', async () => {
    const callOrder: string[] = []
    mockCreateSubscription.mockImplementation(() => {
      callOrder.push('createSubscription')
    })
    mockProcessInitialSubscription.mockImplementation(() => {
      callOrder.push('processInitialSubscription')
    })

    await handler(buildEvent())

    expect(callOrder).toEqual(['createSubscription', 'processInitialSubscription'])
  })

  it('lets errors propagate for EventBridge retry', async () => {
    const error = new Error('DynamoDB failure')
    mockCreateSubscription.mockRejectedValue(error)

    await expect(handler(buildEvent())).rejects.toThrow('DynamoDB failure')
  })
})
