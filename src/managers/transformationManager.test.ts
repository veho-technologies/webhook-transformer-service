import { PackageStatusOperations } from '@veho/events'
import type { LugusPackageLog } from '@veho/merged-api'

import type { ClientConfig, TrackerSubscription } from '../database'
import type { TrackerAttributes, TrackerEventAttributes } from '../types/shopifyTypes'
import { type EnrichedPackageEventWithEventLog, transformationManager } from './transformationManager'

const mockGetByTrackingNumber = jest.fn()
const mockCreateSubscription = jest.fn()
const mockCreateIfNotExists = jest.fn()
const mockGetByClientId = jest.fn()
const mockCreateAttempt = jest.fn()
const mockSendTrackerUpdate = jest.fn()
const mockGetPackageEventHistory = jest.fn()
const mockGetPackageWithHistory = jest.fn()
const mockGetFacilityLocation = jest.fn()

jest.mock('../dataAccessors/trackerSubscriptionDataAccessor', () => ({
  trackerSubscriptionDataAccessor: {
    getByTrackingNumber: (...args: unknown[]) => mockGetByTrackingNumber(...args),
    create: (...args: unknown[]) => mockCreateSubscription(...args),
    createIfNotExists: (...args: unknown[]) => mockCreateIfNotExists(...args),
  },
}))

jest.mock('../dataAccessors/clientConfigDataAccessor', () => ({
  clientConfigDataAccessor: {
    getByClientId: (...args: unknown[]) => mockGetByClientId(...args),
  },
}))

jest.mock('../dataAccessors/transformDeliveryAttemptDataAccessor', () => ({
  transformDeliveryAttemptDataAccessor: {
    create: (...args: unknown[]) => mockCreateAttempt(...args),
  },
}))

jest.mock('../adapters/shopifyGraphqlAdapter', () => ({
  shopifyGraphqlAdapter: {
    sendTrackerUpdate: (...args: unknown[]) => mockSendTrackerUpdate(...args),
  },
}))

jest.mock('../adapters/lugusAdapter', () => ({
  lugusAdapter: {
    getPackageEventHistory: (...args: unknown[]) => mockGetPackageEventHistory(...args),
    getPackageWithHistory: (...args: unknown[]) => mockGetPackageWithHistory(...args),
  },
}))

jest.mock('../adapters/janusAdapter', () => ({
  janusAdapter: {
    getFacilityLocation: (...args: unknown[]) => mockGetFacilityLocation(...args),
  },
}))

const MOCK_SUBSCRIPTION: TrackerSubscription = {
  trackingNumber: 'TRK-123',
  trackerReferenceId: 'ref-456',
  carrierId: 'carrier-789',
  webhookId: 'webhook-001',
  clientId: 'client-123',
  subscribedAt: '2024-01-01T00:00:00.000Z',
}

const MOCK_CONFIG: ClientConfig = {
  clientId: 'client-123',
  endpointType: 'shopify_graphql',
  endpointUrl: 'https://shopify.example.com/graphql',
  authType: 'oauth',
  fieldMappings: [
    { source: 'entity.package.trackingId', target: 'trackingNumber' },
    { source: 'entity.order.address.zipCode', target: 'destinationPostalCode' },
    { source: 'eventLog.eventType', target: 'status', transform: 'statusMap' },
    { source: 'eventLog.timestamp', target: 'happenedAt' },
    { source: 'eventLog.message', target: 'message' },
  ],
  statusMap: {
    delivered: 'DELIVERED',
    pending: 'IN_TRANSIT',
    pickedUpFromVeho: 'OUT_FOR_DELIVERY',
  },
}

const SAMPLE_ENRICHED_EVENT: EnrichedPackageEventWithEventLog = {
  entity: {
    package: {
      id: 'pkg-001',
      trackingId: 'TRK-123',
      orderId: 'ord-001',
      clientId: 'client-123',
      eventLog: [
        {
          eventType: PackageStatusOperations.PENDING,
          timestamp: '2024-01-01T10:00:00Z',
          message: 'Package in transit',
        },
        {
          eventType: PackageStatusOperations.DELIVERED,
          timestamp: '2024-01-02T14:00:00Z',
          message: 'Package delivered',
        },
      ],
    },
    order: {
      id: 'ord-001',
      clientId: 'client-123',
      address: {
        zipCode: '90210',
      },
    },
  },
}

describe('transformationManager', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('processEnrichedPackageEvent', () => {
    it('should transform and send to Shopify when subscription and config exist', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        { eventType: 'pending', timestamp: '2024-01-01T10:00:00Z', message: 'Package in transit' },
        { eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z', message: 'Package delivered' },
      ])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      expect(mockSendTrackerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: 'TRK-123',
          carrierId: 'carrier-789',
          destinationPostalCode: '90210',
          trackerReferenceId: 'ref-456',
          idempotencyKey: 'TRK-123:unknown:2024-01-02T14:00:00Z',
          events: [
            { status: 'DELIVERED', happenedAt: '2024-01-02T14:00:00Z', message: 'Package delivered' },
          ] as TrackerEventAttributes[],
        })
      )

      expect(mockCreateAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: 'TRK-123',
          clientId: 'client-123',
          trackerReferenceId: 'ref-456',
          status: 'success',
          idempotencyKey: 'TRK-123:unknown:2024-01-02T14:00:00Z',
        })
      )
    })

    it('should skip when no subscription exists', async () => {
      mockGetByTrackingNumber.mockResolvedValue(undefined)

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      expect(mockSendTrackerUpdate).not.toHaveBeenCalled()
      expect(mockCreateAttempt).not.toHaveBeenCalled()
    })

    it('should skip when no config exists', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(undefined)

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      expect(mockSendTrackerUpdate).not.toHaveBeenCalled()
      expect(mockCreateAttempt).not.toHaveBeenCalled()
    })

    it('should log failure when Shopify returns unsuccessful', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([])
      mockSendTrackerUpdate.mockResolvedValue({ success: false, errors: [{ field: 'test', message: 'fail' }] })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      expect(mockCreateAttempt).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure' }))
    })

    it('should skip when event has no trackingNumber', async () => {
      await transformationManager.processEnrichedPackageEvent({
        entity: { package: {}, order: {} },
      } as unknown as EnrichedPackageEventWithEventLog)

      expect(mockGetByTrackingNumber).not.toHaveBeenCalled()
      expect(mockSendTrackerUpdate).not.toHaveBeenCalled()
    })

    it('should filter out events missing required fields (status, happenedAt)', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue({
        ...MOCK_CONFIG,
        // only map status — omit happenedAt and message mappings
        fieldMappings: [{ source: 'eventLog.eventType', target: 'status', transform: 'statusMap' }],
      })
      mockGetPackageEventHistory.mockResolvedValue([
        { eventType: 'pending', timestamp: '2024-01-01T10:00:00Z', message: 'Package in transit' },
        { eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z', message: 'Package delivered' },
      ])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      const trackerAttrs = mockSendTrackerUpdate.mock.calls[0][0]
      // events are missing happenedAt → all filtered out
      expect(trackerAttrs.events).toEqual([])
    })

    it('should resolve default message from Anansi when eventLog.message is missing', async () => {
      const configWithOriginalEventCode: ClientConfig = {
        ...MOCK_CONFIG,
        fieldMappings: [
          { source: 'eventLog.eventType', target: 'status', transform: 'statusMap' },
          { source: 'eventLog.timestamp', target: 'happenedAt' },
          { source: 'eventLog.eventType', target: 'originalEventCode' },
        ],
      }
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(configWithOriginalEventCode)
      mockGetPackageEventHistory.mockResolvedValue([{ eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z' }])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      const trackerAttrs = mockSendTrackerUpdate.mock.calls[0][0]
      expect(trackerAttrs.events).toHaveLength(1)
      expect(trackerAttrs.events[0].message).toBe('Package delivered')
    })

    it('should resolve supplementary message for event codes not in Anansi', async () => {
      const configWithOriginalEventCode: ClientConfig = {
        ...MOCK_CONFIG,
        fieldMappings: [
          { source: 'eventLog.eventType', target: 'status', transform: 'statusMap' },
          { source: 'eventLog.timestamp', target: 'happenedAt' },
          { source: 'eventLog.eventType', target: 'originalEventCode' },
        ],
        statusMap: { ...MOCK_CONFIG.statusMap, delayed: 'DELAYED' },
      }
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(configWithOriginalEventCode)
      mockGetPackageEventHistory.mockResolvedValue([{ eventType: 'delayed', timestamp: '2024-01-02T14:00:00Z' }])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      const trackerAttrs = mockSendTrackerUpdate.mock.calls[0][0]
      expect(trackerAttrs.events).toHaveLength(1)
      expect(trackerAttrs.events[0].message).toBe('The package has been delayed')
    })

    it('should fall back to status string when no message source is available', async () => {
      const configNoOriginalEventCode: ClientConfig = {
        ...MOCK_CONFIG,
        fieldMappings: [
          { source: 'eventLog.eventType', target: 'status', transform: 'statusMap' },
          { source: 'eventLog.timestamp', target: 'happenedAt' },
        ],
      }
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(configNoOriginalEventCode)
      mockGetPackageEventHistory.mockResolvedValue([{ eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z' }])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      const trackerAttrs = mockSendTrackerUpdate.mock.calls[0][0]
      expect(trackerAttrs.events).toHaveLength(1)
      expect(trackerAttrs.events[0].message).toBe('DELIVERED')
    })

    it('should use Lugus coordinates with Janus city when both available', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        {
          eventType: 'delivered',
          timestamp: '2024-01-02T14:00:00Z',
          message: 'Package delivered',
          location: { lat: 40.71, lng: -74.0 },
        },
      ])
      mockGetFacilityLocation.mockResolvedValue({ lat: 42.36, lng: -71.06, city: 'Boston' })
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      const eventWithFacility = {
        ...SAMPLE_ENRICHED_EVENT,
        entity: {
          ...SAMPLE_ENRICHED_EVENT.entity,
          order: { ...SAMPLE_ENRICHED_EVENT.entity.order, platformFacilityId: 'platform-fac-001' },
        },
      } as EnrichedPackageEventWithEventLog

      await transformationManager.processEnrichedPackageEvent(eventWithFacility)

      const trackerAttrs: TrackerAttributes = mockSendTrackerUpdate.mock.calls[0][0]
      // Lugus coordinates preferred over Janus
      expect(trackerAttrs.events[0].latitude).toBe(40.71)
      expect(trackerAttrs.events[0].longitude).toBe(-74.0)
      // City from Janus
      expect(trackerAttrs.events[0].city).toBe('Boston')
    })

    it('should keep Lugus coordinates when Janus has no location', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        {
          eventType: 'delivered',
          timestamp: '2024-01-02T14:00:00Z',
          message: 'Package delivered',
          location: { lat: 40.71, lng: -74.0 },
        },
      ])
      mockGetFacilityLocation.mockResolvedValue(null)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      const eventWithFacility = {
        ...SAMPLE_ENRICHED_EVENT,
        entity: {
          ...SAMPLE_ENRICHED_EVENT.entity,
          order: { ...SAMPLE_ENRICHED_EVENT.entity.order, platformFacilityId: 'platform-fac-001' },
        },
      } as EnrichedPackageEventWithEventLog

      await transformationManager.processEnrichedPackageEvent(eventWithFacility)

      const trackerAttrs: TrackerAttributes = mockSendTrackerUpdate.mock.calls[0][0]
      expect(trackerAttrs.events[0].latitude).toBe(40.71)
      expect(trackerAttrs.events[0].longitude).toBe(-74.0)
      expect(trackerAttrs.events[0].city).toBeUndefined()
    })

    it('should use Janus for all fields when Lugus location is missing', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        { eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z', message: 'Package delivered' },
      ])
      mockGetFacilityLocation.mockResolvedValue({ lat: 42.36, lng: -71.06, city: 'Boston' })
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      const eventWithFacility = {
        ...SAMPLE_ENRICHED_EVENT,
        entity: {
          ...SAMPLE_ENRICHED_EVENT.entity,
          order: { ...SAMPLE_ENRICHED_EVENT.entity.order, platformFacilityId: 'platform-fac-001' },
        },
      } as EnrichedPackageEventWithEventLog

      await transformationManager.processEnrichedPackageEvent(eventWithFacility)

      expect(mockGetFacilityLocation).toHaveBeenCalledWith('platform-fac-001')
      const trackerAttrs: TrackerAttributes = mockSendTrackerUpdate.mock.calls[0][0]
      expect(trackerAttrs.events[0].latitude).toBe(42.36)
      expect(trackerAttrs.events[0].longitude).toBe(-71.06)
      expect(trackerAttrs.events[0].city).toBe('Boston')
    })

    it('should fall back to Janus via facilityId when platformFacilityId returns no coordinates', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        { eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z', message: 'Package delivered' },
      ])
      mockGetFacilityLocation
        .mockResolvedValueOnce(null) // platformFacilityId returns nothing
        .mockResolvedValueOnce({ lat: 33.75, lng: -84.39, city: 'Atlanta' }) // facilityId succeeds
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      const eventWithBothIds = {
        ...SAMPLE_ENRICHED_EVENT,
        entity: {
          ...SAMPLE_ENRICHED_EVENT.entity,
          order: {
            ...SAMPLE_ENRICHED_EVENT.entity.order,
            platformFacilityId: 'platform-fac-001',
            facilityId: 'legacy-fac-002',
          },
        },
      } as EnrichedPackageEventWithEventLog

      await transformationManager.processEnrichedPackageEvent(eventWithBothIds)

      expect(mockGetFacilityLocation).toHaveBeenCalledTimes(2)
      expect(mockGetFacilityLocation).toHaveBeenNthCalledWith(1, 'platform-fac-001')
      expect(mockGetFacilityLocation).toHaveBeenNthCalledWith(2, 'legacy-fac-002')
      const trackerAttrs: TrackerAttributes = mockSendTrackerUpdate.mock.calls[0][0]
      expect(trackerAttrs.events[0].latitude).toBe(33.75)
      expect(trackerAttrs.events[0].longitude).toBe(-84.39)
    })

    it('should not duplicate Janus call when facilityId equals platformFacilityId', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        { eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z', message: 'Package delivered' },
      ])
      mockGetFacilityLocation.mockResolvedValue(null)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      const eventWithSameIds = {
        ...SAMPLE_ENRICHED_EVENT,
        entity: {
          ...SAMPLE_ENRICHED_EVENT.entity,
          order: {
            ...SAMPLE_ENRICHED_EVENT.entity.order,
            platformFacilityId: 'same-fac-id',
            facilityId: 'same-fac-id',
          },
        },
      } as EnrichedPackageEventWithEventLog

      await transformationManager.processEnrichedPackageEvent(eventWithSameIds)

      expect(mockGetFacilityLocation).toHaveBeenCalledTimes(1)
      expect(mockGetFacilityLocation).toHaveBeenCalledWith('same-fac-id')
    })

    it('should send events without coordinates when no source is available', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        { eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z', message: 'Package delivered' },
      ])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      const trackerAttrs: TrackerAttributes = mockSendTrackerUpdate.mock.calls[0][0]
      expect(trackerAttrs.events[0].latitude).toBeUndefined()
      expect(trackerAttrs.events[0].longitude).toBeUndefined()
      expect(trackerAttrs.events[0].city).toBeUndefined()
      expect(mockGetFacilityLocation).not.toHaveBeenCalled()
    })

    it('should only send the latest event from Lugus', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        { eventType: 'pending', timestamp: '2024-01-01T10:00:00Z', message: 'Package in transit' },
        { eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z', message: 'Package delivered' },
      ])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(SAMPLE_ENRICHED_EVENT)

      const trackerAttrs = mockSendTrackerUpdate.mock.calls[0][0]
      expect(trackerAttrs.events).toHaveLength(1)
      expect(trackerAttrs.events[0].status).toBe('DELIVERED')
      expect(trackerAttrs.events[0].happenedAt).toBe('2024-01-02T14:00:00Z')
    })
  })

  describe('processStatusRequest', () => {
    const params = {
      trackingNumber: 'TRK-123',
      webhookId: 'webhook-789',
      idempotencyKey: 'idem-key-001',
    }

    it('should look up subscription and pass verbatim webhookId and idempotencyKey to Shopify', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([
        { eventType: 'delivered', timestamp: '2024-01-02T14:00:00Z', message: 'Delivered' },
      ])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processStatusRequest(params)

      expect(mockGetByTrackingNumber).toHaveBeenCalledWith('TRK-123')
      expect(mockSendTrackerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: 'TRK-123',
          carrierId: 'carrier-789',
          trackerReferenceId: 'ref-456',
          webhookId: 'webhook-789',
          idempotencyKey: 'idem-key-001',
          events: [{ status: 'DELIVERED', happenedAt: '2024-01-02T14:00:00Z', message: 'Delivered' }],
        })
      )
    })

    it('should call lugusAdapter with correct trackingNumber', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processStatusRequest(params)

      expect(mockGetPackageEventHistory).toHaveBeenCalledWith('TRK-123')
    })

    it('should log delivery attempt with subscription data', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue([])
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processStatusRequest(params)

      expect(mockCreateAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: 'TRK-123',
          clientId: 'client-123',
          trackerReferenceId: 'ref-456',
          status: 'success',
          idempotencyKey: 'idem-key-001',
        })
      )
    })

    it('should skip when no subscription exists', async () => {
      mockGetByTrackingNumber.mockResolvedValue(undefined)

      await transformationManager.processStatusRequest(params)

      expect(mockGetPackageEventHistory).not.toHaveBeenCalled()
      expect(mockSendTrackerUpdate).not.toHaveBeenCalled()
    })

    it('should skip when no config exists', async () => {
      mockGetByTrackingNumber.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(undefined)

      await transformationManager.processStatusRequest(params)

      expect(mockGetPackageEventHistory).not.toHaveBeenCalled()
      expect(mockSendTrackerUpdate).not.toHaveBeenCalled()
    })
  })

  describe('processInitialSubscription', () => {
    const params = {
      trackingNumber: 'TRK-123',
      trackerReferenceId: 'ref-456',
      carrierId: 'carrier-789',
      webhookId: 'webhook-001',
      idempotencyKey: 'shopify-idem-001',
    }

    it('should get clientId from Lugus, create subscription via conditional write, and send to Shopify', async () => {
      mockGetPackageWithHistory.mockResolvedValue({ clientId: 'client-123', packageLog: [] })
      mockCreateIfNotExists.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processInitialSubscription(params)

      expect(mockGetPackageWithHistory).toHaveBeenCalledWith('TRK-123')
      expect(mockCreateIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: 'TRK-123',
          trackerReferenceId: 'ref-456',
          carrierId: 'carrier-789',
          clientId: 'client-123',
        })
      )
      expect(mockSendTrackerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ trackerReferenceId: 'ref-456', idempotencyKey: 'shopify-idem-001' })
      )
    })

    it('should use persisted trackerReferenceId and carrierId when subscription already existed', async () => {
      const existingSubscription: TrackerSubscription = {
        ...MOCK_SUBSCRIPTION,
        trackerReferenceId: 'persisted-ref',
        carrierId: 'persisted-carrier',
      }
      mockGetPackageWithHistory.mockResolvedValue({ clientId: 'client-123', packageLog: [] })
      mockCreateIfNotExists.mockResolvedValue(existingSubscription)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processInitialSubscription(params)

      expect(mockSendTrackerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          carrierId: 'persisted-carrier',
          trackerReferenceId: 'persisted-ref',
          idempotencyKey: 'shopify-idem-001',
        })
      )
      expect(mockCreateAttempt).toHaveBeenCalledWith(expect.objectContaining({ trackerReferenceId: 'persisted-ref' }))
    })

    it('should call Shopify with transformed events', async () => {
      mockGetPackageWithHistory.mockResolvedValue({
        clientId: 'client-123',
        packageLog: [{ eventType: 'pickedUpFromVeho', timestamp: '2024-01-02T10:00:00Z', message: 'Out for delivery' }],
      })
      mockCreateIfNotExists.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processInitialSubscription(params)

      expect(mockSendTrackerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: 'TRK-123',
          carrierId: 'carrier-789',
          trackerReferenceId: 'ref-456',
          idempotencyKey: 'shopify-idem-001',
          events: [{ status: 'OUT_FOR_DELIVERY', happenedAt: '2024-01-02T10:00:00Z', message: 'Out for delivery' }],
        })
      )
    })

    it('should log delivery attempt', async () => {
      mockGetPackageWithHistory.mockResolvedValue({ clientId: 'client-123', packageLog: [] })
      mockCreateIfNotExists.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(MOCK_CONFIG)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processInitialSubscription(params)

      expect(mockCreateAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: 'TRK-123',
          clientId: 'client-123',
          status: 'success',
          idempotencyKey: 'shopify-idem-001',
        })
      )
    })

    it('should skip when Lugus returns no clientId', async () => {
      mockGetPackageWithHistory.mockResolvedValue({ clientId: null, packageLog: [] })

      await transformationManager.processInitialSubscription(params)

      expect(mockCreateIfNotExists).not.toHaveBeenCalled()
      expect(mockSendTrackerUpdate).not.toHaveBeenCalled()
    })

    it('should write subscription but skip sending when no config exists', async () => {
      mockGetPackageWithHistory.mockResolvedValue({ clientId: 'client-123', packageLog: [] })
      mockCreateIfNotExists.mockResolvedValue(MOCK_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(undefined)

      await transformationManager.processInitialSubscription(params)

      expect(mockCreateIfNotExists).toHaveBeenCalled()
      expect(mockSendTrackerUpdate).not.toHaveBeenCalled()
    })
  })

  describe('realistic data transformation', () => {
    // Realistic ClientConfig with full field mappings including location, originalEvent, delivery windows
    const REALISTIC_CONFIG: ClientConfig = {
      clientId: 'client-shopify-001',
      endpointType: 'shopify_graphql',
      endpointUrl: 'https://test-merchant.myshopify.com/admin/api/2024-01/graphql.json',
      authType: 'oauth',
      fieldMappings: [
        // Top-level: EnrichedPackageEvent → TrackerAttributes
        { source: 'entity.package.trackingId', target: 'trackingNumber' },
        { source: 'entity.package.destination.zipCode', target: 'destinationPostalCode' },
        { source: 'entity.package.serviceClass', target: 'mailClass', transform: 'statusMap' },
        { source: 'entity.package.deliveryTimeWindow.startsAt', target: 'estimatedDeliveryDateTimeStart' },
        { source: 'entity.package.deliveryTimeWindow.endsAt', target: 'estimatedDeliveryDateTimeEnd' },
        // Event-level: eventLog entry → TrackerEventAttributes
        { source: 'eventLog.eventType', target: 'status', transform: 'statusMap' },
        { source: 'eventLog.timestamp', target: 'happenedAt' },
        { source: 'eventLog.message', target: 'message' },
        { source: 'eventLog.location.lat', target: 'latitude' },
        { source: 'eventLog.location.lng', target: 'longitude' },
        { source: 'eventLog.eventType', target: 'originalEventCode' },
        { source: 'eventLog.message', target: 'originalEventMessage' },
      ],
      statusMap: {
        delivered: 'DELIVERED',
        pickedUpFromVeho: 'OUT_FOR_DELIVERY',
        droppedOffAtVeho: 'IN_TRANSIT',
        pickedUpFromClient: 'IN_TRANSIT',
        created: 'PRE_TRANSIT',
        nextDay: 'STANDARD_GROUND',
        sameDay: 'EXPEDITED_STANDARD',
      },
    }

    const REALISTIC_SUBSCRIPTION: TrackerSubscription = {
      trackingNumber: 'VEHO-TRK-12345',
      trackerReferenceId: 'gid://shopify/Tracker/12345',
      carrierId: 'veho-carrier-id',
      webhookId: 'shopify-webhook-abc',
      clientId: 'client-shopify-001',
      subscribedAt: '2024-08-19T10:00:00.000Z',
    }

    // Realistic EnrichedPackageEvent using actual @veho/events types
    const REALISTIC_ENRICHED_EVENT: EnrichedPackageEventWithEventLog = {
      model: 'OrderAndPackage',
      operation: PackageStatusOperations.PICKED_UP_FROM_VEHO,
      entity: {
        package: {
          id: 'pkg-001',
          trackingId: 'VEHO-TRK-12345',
          orderId: 'ord-001',
          clientId: 'client-shopify-001',
          barCode: 'BC-12345',
          lastEvent: PackageStatusOperations.PICKED_UP_FROM_VEHO,
          destination: {
            street: '123 Main St',
            city: 'Toronto',
            state: 'ON',
            zipCode: 'M5V 2T6',
            country: 'CA',
            location: { lat: 43.6426, lng: -79.3871 },
          },
          deliveryTimeWindow: {
            startsAt: '2024-08-21T09:00:00Z',
            endsAt: '2024-08-21T17:00:00Z',
          },
          serviceClass: 'nextDay',
          timeZone: 'America/Toronto',
          eventLog: [
            {
              eventType: PackageStatusOperations.PICKED_UP_FROM_CLIENT,
              timestamp: '2024-08-19T14:00:00Z',
              message: 'Picked up from client facility',
              location: { lat: 40.7128, lng: -74.006 },
            },
            {
              eventType: PackageStatusOperations.DROPPED_OFF_AT_VEHO,
              timestamp: '2024-08-19T22:00:00Z',
              message: 'Arrived at Veho sort facility',
              location: { lat: 42.3601, lng: -71.0589 },
            },
            {
              eventType: PackageStatusOperations.PICKED_UP_FROM_VEHO,
              timestamp: '2024-08-21T08:00:00Z',
              message: 'On vehicle for delivery',
              location: { lat: 43.6426, lng: -79.3871 },
            },
          ],
        },
        order: {
          id: 'ord-001',
          clientId: 'client-shopify-001',
          clientName: 'test-merchant',
          address: {
            street: '123 Main St',
            city: 'Toronto',
            state: 'ON',
            zipCode: 'M5V 2T6',
            country: 'CA',
          },
        },
      },
    }

    // Realistic LugusPackageLog entries using actual @veho/merged-api type
    const REALISTIC_LUGUS_EVENTS: LugusPackageLog[] = [
      {
        __typename: 'LugusPackageLog',
        eventType: 'pickedUpFromClient',
        timestamp: '2024-08-19T14:00:00Z',
        message: 'Picked up from client facility',
        location: { __typename: 'LugusLocation', lat: 40.7128, lng: -74.006 },
        packageId: 'pkg-001',
        meta: null,
      },
      {
        __typename: 'LugusPackageLog',
        eventType: 'droppedOffAtVeho',
        timestamp: '2024-08-19T22:00:00Z',
        message: 'Arrived at Veho sort facility',
        location: { __typename: 'LugusLocation', lat: 42.3601, lng: -71.0589 },
        packageId: 'pkg-001',
        meta: null,
      },
      {
        __typename: 'LugusPackageLog',
        eventType: 'pickedUpFromVeho',
        timestamp: '2024-08-21T08:00:00Z',
        message: 'On vehicle for delivery',
        location: { __typename: 'LugusLocation', lat: 43.6426, lng: -79.3871 },
        packageId: 'pkg-001',
        meta: null,
      },
    ]

    const EXPECTED_TRACKER_EVENTS = [
      {
        status: 'IN_TRANSIT',
        happenedAt: '2024-08-19T14:00:00Z',
        message: 'Picked up from client facility',
        latitude: 40.7128,
        longitude: -74.006,
        originalEventCode: 'pickedUpFromClient',
        originalEventMessage: 'Picked up from client facility',
      },
      {
        status: 'IN_TRANSIT',
        happenedAt: '2024-08-19T22:00:00Z',
        message: 'Arrived at Veho sort facility',
        latitude: 42.3601,
        longitude: -71.0589,
        originalEventCode: 'droppedOffAtVeho',
        originalEventMessage: 'Arrived at Veho sort facility',
      },
      {
        status: 'OUT_FOR_DELIVERY',
        happenedAt: '2024-08-21T08:00:00Z',
        message: 'On vehicle for delivery',
        latitude: 43.6426,
        longitude: -79.3871,
        originalEventCode: 'pickedUpFromVeho',
        originalEventMessage: 'On vehicle for delivery',
      },
    ]

    it('processEnrichedPackageEvent: transforms realistic EnrichedPackageEvent to TrackerAttributes', async () => {
      mockGetByTrackingNumber.mockResolvedValue(REALISTIC_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(REALISTIC_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue(REALISTIC_LUGUS_EVENTS)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processEnrichedPackageEvent(REALISTIC_ENRICHED_EVENT)

      const trackerAttrs: TrackerAttributes = mockSendTrackerUpdate.mock.calls[0][0]

      // Top-level TrackerAttributes fields
      expect(trackerAttrs.trackingNumber).toBe('VEHO-TRK-12345')
      expect(trackerAttrs.carrierId).toBe('veho-carrier-id')
      expect(trackerAttrs.destinationPostalCode).toBe('M5V 2T6')
      expect(trackerAttrs.mailClass).toBe('STANDARD_GROUND')
      expect(trackerAttrs.estimatedDeliveryDateTimeStart).toBe('2024-08-21T09:00:00Z')
      expect(trackerAttrs.estimatedDeliveryDateTimeEnd).toBe('2024-08-21T17:00:00Z')

      // Only the latest event from Lugus
      expect(trackerAttrs.events).toHaveLength(1)
      expect(trackerAttrs.events[0]).toEqual(EXPECTED_TRACKER_EVENTS[EXPECTED_TRACKER_EVENTS.length - 1])
    })

    it('processStatusRequest: looks up subscription and transforms realistic LugusPackageLog[] to TrackerAttributes', async () => {
      mockGetByTrackingNumber.mockResolvedValue(REALISTIC_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(REALISTIC_CONFIG)
      mockGetPackageEventHistory.mockResolvedValue(REALISTIC_LUGUS_EVENTS)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processStatusRequest({
        trackingNumber: 'VEHO-TRK-12345',
        webhookId: 'shopify-webhook-abc',
        idempotencyKey: 'shopify-idem-xyz',
      })

      const trackerAttrs: TrackerAttributes = mockSendTrackerUpdate.mock.calls[0][0]

      expect(trackerAttrs.trackingNumber).toBe('VEHO-TRK-12345')
      expect(trackerAttrs.carrierId).toBe('veho-carrier-id')
      expect(trackerAttrs.events).toEqual(EXPECTED_TRACKER_EVENTS)

      // Verbatim pass-through of Shopify webhook params
      expect(mockSendTrackerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          trackerReferenceId: 'gid://shopify/Tracker/12345',
          webhookId: 'shopify-webhook-abc',
          idempotencyKey: 'shopify-idem-xyz',
        })
      )
    })

    it('processInitialSubscription: fetches clientId from Lugus and transforms packageLog to TrackerAttributes', async () => {
      mockGetPackageWithHistory.mockResolvedValue({
        clientId: 'client-shopify-001',
        packageLog: REALISTIC_LUGUS_EVENTS,
      })
      mockCreateIfNotExists.mockResolvedValue(REALISTIC_SUBSCRIPTION)
      mockGetByClientId.mockResolvedValue(REALISTIC_CONFIG)
      mockSendTrackerUpdate.mockResolvedValue({ success: true })
      mockCreateAttempt.mockResolvedValue({})

      await transformationManager.processInitialSubscription({
        trackingNumber: 'VEHO-TRK-12345',
        trackerReferenceId: 'gid://shopify/Tracker/12345',
        carrierId: 'veho-carrier-id',
        webhookId: 'shopify-webhook-abc',
        idempotencyKey: 'shopify-idem-xyz',
      })

      const trackerAttrs: TrackerAttributes = mockSendTrackerUpdate.mock.calls[0][0]

      expect(trackerAttrs.trackingNumber).toBe('VEHO-TRK-12345')
      expect(trackerAttrs.carrierId).toBe('veho-carrier-id')
      expect(trackerAttrs.events).toEqual(EXPECTED_TRACKER_EVENTS)

      // Uses Shopify's idempotencyKey from the subscribe webhook
      expect(mockSendTrackerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          trackerReferenceId: 'gid://shopify/Tracker/12345',
          idempotencyKey: 'shopify-idem-xyz',
        })
      )

      // Subscription created via conditional write with clientId from Lugus
      expect(mockCreateIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: 'VEHO-TRK-12345',
          trackerReferenceId: 'gid://shopify/Tracker/12345',
          carrierId: 'veho-carrier-id',
          clientId: 'client-shopify-001',
        })
      )
    })
  })
})
