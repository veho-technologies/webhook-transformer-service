import type { TrackingStatusRequestedEvent } from '@veho/event-types'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { transformationManager } from '../managers/transformationManager'
import { handler } from './trackerStatusRequestedConsumer'

jest.mock('../dataAccessors/trackerSubscriptionDataAccessor', () => ({
  trackerSubscriptionDataAccessor: {
    listByClientId: jest.fn(),
  },
}))

jest.mock('../managers/transformationManager', () => ({
  transformationManager: {
    processStatusRequest: jest.fn(),
  },
}))

const mockListByClientId = trackerSubscriptionDataAccessor.listByClientId as jest.Mock
const mockProcessStatusRequest = transformationManager.processStatusRequest as jest.Mock

function buildEvent(
  overrides: Partial<TrackingStatusRequestedEvent['payload']> = {}
): EventBridgeEvent<'TrackingStatusRequested', TrackingStatusRequestedEvent> {
  return {
    id: 'test-id',
    version: '0',
    account: '123456789',
    time: '2024-01-01T00:00:00Z',
    region: 'us-east-1',
    resources: [],
    source: 'veho.tracker',
    'detail-type': 'TrackingStatusRequested',
    detail: {
      eventName: 'TrackingStatusRequested',
      trigger: {
        source: 'Event',
        eventId: 'evt-001',
        initialEventId: 'evt-000',
      } as unknown as TrackingStatusRequestedEvent['trigger'],
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
        providerTest: false,
        ...overrides,
      },
    },
  }
}

describe('trackerStatusRequestedConsumer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('looks up subscription and calls processStatusRequest', async () => {
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
    expect(mockProcessStatusRequest).toHaveBeenCalledWith({
      trackingNumber: 'TRK-001',
      webhookId: 'webhook-001',
      idempotencyKey: 'idem-001',
    })
  })

  it('warns and returns when no matching subscription found', async () => {
    mockListByClientId.mockResolvedValue([])

    await handler(buildEvent())

    expect(mockProcessStatusRequest).not.toHaveBeenCalled()
  })

  it('matches subscription by providerTrackerId', async () => {
    mockListByClientId.mockResolvedValue([
      {
        trackingNumber: 'TRK-999',
        trackerReferenceId: 'other-tracker',
        clientId: 'client-001',
        carrierId: 'c1',
        subscribedAt: '2024-01-01T00:00:00Z',
      },
      {
        trackingNumber: 'TRK-001',
        trackerReferenceId: 'shopify-tracker-001',
        clientId: 'client-001',
        carrierId: 'c2',
        subscribedAt: '2024-01-01T00:00:00Z',
      },
    ])

    await handler(buildEvent())

    expect(mockProcessStatusRequest).toHaveBeenCalledWith(expect.objectContaining({ trackingNumber: 'TRK-001' }))
  })

  it('lets errors propagate for EventBridge retry', async () => {
    const error = new Error('transformation failure')
    mockListByClientId.mockRejectedValue(error)

    await expect(handler(buildEvent())).rejects.toThrow('transformation failure')
  })
})
