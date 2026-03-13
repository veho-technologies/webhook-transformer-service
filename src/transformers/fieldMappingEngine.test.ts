import { log } from '@veho/observability-sdk'

import { applyFieldMapping, getNestedValue, type MappingConfig } from './fieldMappingEngine'

describe('getNestedValue', () => {
  it('resolves a 3+ level dot-path', () => {
    const obj = { a: { b: { c: 'deep' } } }
    expect(getNestedValue(obj, 'a.b.c')).toBe('deep')
  })

  it('returns undefined for a missing intermediate key', () => {
    const obj = { a: { b: 1 } }
    expect(getNestedValue(obj, 'a.x.y')).toBeUndefined()
  })

  it('returns undefined when traversing through a primitive', () => {
    const obj = { a: 42 }
    expect(getNestedValue(obj, 'a.b')).toBeUndefined()
  })

  it('resolves a top-level key', () => {
    const obj = { foo: 'bar' }
    expect(getNestedValue(obj, 'foo')).toBe('bar')
  })

  it('returns undefined for any path on an empty object', () => {
    expect(getNestedValue({}, 'a.b.c')).toBeUndefined()
  })
})

describe('applyFieldMapping', () => {
  it('maps flat fields from source to target', () => {
    const config: MappingConfig = {
      mappings: [
        { source: 'order.id', target: 'orderId' },
        { source: 'order.tracking', target: 'trackingNumber' },
      ],
      statusMap: {},
    }
    const source = { order: { id: 'ORD-1', tracking: 'TRK-123' } }

    expect(applyFieldMapping(source, config)).toEqual({
      orderId: 'ORD-1',
      trackingNumber: 'TRK-123',
    })
  })

  it('applies statusMap transform', () => {
    const config: MappingConfig = {
      mappings: [{ source: 'status', target: 'fulfillmentStatus', transform: 'statusMap' }],
      statusMap: { delivered: 'DELIVERED', in_transit: 'IN_TRANSIT' },
    }

    expect(applyFieldMapping({ status: 'delivered' }, config)).toEqual({
      fulfillmentStatus: 'DELIVERED',
    })
  })

  it('passes through unknown status values and warns', () => {
    const warnSpy = jest.spyOn(log, 'warn').mockImplementation()
    const config: MappingConfig = {
      mappings: [{ source: 'status', target: 'fulfillmentStatus', transform: 'statusMap' }],
      statusMap: { delivered: 'DELIVERED' },
    }

    const result = applyFieldMapping({ status: 'new_status' }, config)

    expect(result).toEqual({ fulfillmentStatus: 'new_status' })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown status value: "new_status"'))
    warnSpy.mockRestore()
  })

  it('omits fields when source path is missing', () => {
    const config: MappingConfig = {
      mappings: [
        { source: 'exists', target: 'found' },
        { source: 'missing.path', target: 'notFound' },
      ],
      statusMap: {},
    }

    expect(applyFieldMapping({ exists: 'yes' }, config)).toEqual({ found: 'yes' })
  })

  it('returns an empty object for empty mappings', () => {
    const config: MappingConfig = { mappings: [], statusMap: {} }
    expect(applyFieldMapping({ any: 'data' }, config)).toEqual({})
  })

  /**
   * Full Shopify fixture: EnrichedPackageEvent → trackerUpdate payload.
   *
   * This engine only maps flat scalar fields. It does NOT iterate arrays.
   * The transformationManager is responsible for:
   *   1. Calling applyFieldMapping on the full event → top-level TrackerAttributes
   *   2. Iterating package.eventLog[], calling applyFieldMapping per entry → TrackerEvent[]
   *   3. Assembling the final { ...topLevel, events: [...] } payload
   *
   * This test demonstrates both passes as the manager would invoke them.
   */
  it('maps a full EnrichedPackageEvent fixture to Shopify trackerUpdate fields', () => {
    // Source: EnrichedPackageEvent from hydratrEventBus (schema from @veho/event-types)
    const enrichedPackageEvent = {
      payload: {
        model: 'OrderAndPackage',
        operation: 'pickedUpFromVeho',
        entity: {
          package: {
            id: 'pkg-001',
            trackingId: 'VEHO-TRK-12345',
            lastEvent: 'pickedUpFromVeho',
            destination: {
              zipCode: 'G7H8I9',
              city: 'Eastern City',
              state: 'ON',
              country: 'CA',
              location: { lat: 45.6789, lng: -90.1234 },
            },
            deliveryTimeWindow: {
              startsAt: '2024-08-21T09:00:00Z',
              endsAt: '2024-08-21T17:00:00Z',
            },
            serviceClass: 'nextDay',
            timeZone: 'America/Toronto',
            // eventLog lives here — the engine doesn't touch it, transformationManager iterates it
            eventLog: [
              {
                eventType: 'pickedUpFromClient',
                timestamp: '2024-08-19T14:00:00Z',
                message: 'Picked up from client facility',
                location: { lat: 40.7128, lng: -74.006 },
              },
              {
                eventType: 'droppedOffAtVeho',
                timestamp: '2024-08-19T22:00:00Z',
                message: 'Arrived at Veho facility',
                location: { lat: 42.3601, lng: -71.0589 },
              },
              {
                eventType: 'pickedUpFromVeho',
                timestamp: '2024-08-21T08:00:00Z',
                message: 'On vehicle for delivery',
                location: { lat: 45.6789, lng: -90.1234 },
              },
            ],
          },
          order: {
            clientId: 'shopify',
            clientName: 'test-merchant',
          },
        },
        meta: {
          timestamp: '2024-08-21T08:00:00Z',
          message: 'On vehicle for delivery',
        },
      },
    }

    const statusMap: Record<string, string> = {
      delivered: 'DELIVERED',
      pickedUpFromVeho: 'OUT_FOR_DELIVERY',
      droppedOffAtVeho: 'IN_TRANSIT',
      pickedUpFromClient: 'IN_TRANSIT',
      created: 'PRE_TRANSIT',
      nextDay: 'STANDARD_GROUND',
      sameDay: 'EXPEDITED_STANDARD',
    }

    // --- Pass 1: top-level TrackerAttributes (from Shopify trackerUpdate mutation spec) ---
    const topLevelConfig: MappingConfig = {
      mappings: [
        { source: 'payload.entity.package.trackingId', target: 'trackingNumber' },
        { source: 'payload.entity.package.destination.zipCode', target: 'destinationPostalCode' },
        { source: 'payload.entity.package.serviceClass', target: 'mailClass', transform: 'statusMap' },
        { source: 'payload.entity.package.deliveryTimeWindow.startsAt', target: 'estimatedDeliveryDateTimeStart' },
        { source: 'payload.entity.package.deliveryTimeWindow.endsAt', target: 'estimatedDeliveryDateTimeEnd' },
      ],
      statusMap,
    }

    const topLevel = applyFieldMapping(enrichedPackageEvent, topLevelConfig)

    expect(topLevel).toEqual({
      trackingNumber: 'VEHO-TRK-12345',
      destinationPostalCode: 'G7H8I9',
      mailClass: 'STANDARD_GROUND',
      estimatedDeliveryDateTimeStart: '2024-08-21T09:00:00Z',
      estimatedDeliveryDateTimeEnd: '2024-08-21T17:00:00Z',
    })

    // --- Pass 2: per-event TrackerEvent mapping ---
    // transformationManager would iterate eventLog and build a wrapper object per entry
    // so the engine can resolve dot-paths against it.
    const eventConfig: MappingConfig = {
      mappings: [
        { source: 'eventType', target: 'status', transform: 'statusMap' },
        { source: 'message', target: 'message' },
        { source: 'timestamp', target: 'happenedAt' },
        { source: 'location.lat', target: 'latitude' },
        { source: 'location.lng', target: 'longitude' },
        { source: 'eventType', target: 'originalEventCode' },
        { source: 'message', target: 'originalEventMessage' },
      ],
      statusMap,
    }

    const eventLog = enrichedPackageEvent.payload.entity.package.eventLog
    const events = eventLog.map(entry => applyFieldMapping(entry, eventConfig))

    expect(events).toEqual([
      {
        status: 'IN_TRANSIT',
        message: 'Picked up from client facility',
        happenedAt: '2024-08-19T14:00:00Z',
        latitude: 40.7128,
        longitude: -74.006,
        originalEventCode: 'pickedUpFromClient',
        originalEventMessage: 'Picked up from client facility',
      },
      {
        status: 'IN_TRANSIT',
        message: 'Arrived at Veho facility',
        happenedAt: '2024-08-19T22:00:00Z',
        latitude: 42.3601,
        longitude: -71.0589,
        originalEventCode: 'droppedOffAtVeho',
        originalEventMessage: 'Arrived at Veho facility',
      },
      {
        status: 'OUT_FOR_DELIVERY',
        message: 'On vehicle for delivery',
        happenedAt: '2024-08-21T08:00:00Z',
        latitude: 45.6789,
        longitude: -90.1234,
        originalEventCode: 'pickedUpFromVeho',
        originalEventMessage: 'On vehicle for delivery',
      },
    ])
  })
})
