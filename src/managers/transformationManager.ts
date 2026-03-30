import { getHumanReadablePackageOperationText } from '@veho/client-api-contract'
import type { EnrichedPackageEvent, OrderAndPackage, Package } from '@veho/events'
import { log } from '@veho/observability-sdk'
import { ulid } from 'ulid'

import { janusAdapter } from '../adapters/janusAdapter'
import { lugusAdapter } from '../adapters/lugusAdapter'
import { shopifyGraphqlAdapter } from '../adapters/shopifyGraphqlAdapter'
import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'
import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { transformDeliveryAttemptDataAccessor } from '../dataAccessors/transformDeliveryAttemptDataAccessor'
import type { ClientConfig } from '../database'
import { applyFieldMapping, type FieldMapping } from '../transformers/fieldMappingEngine'
import {
  SHOPIFY_SUPPLEMENTARY_EVENT_MESSAGES,
  type TrackerAttributes,
  type TrackerEventAttributes,
} from '../types/shopifyTypes'

/**
 * Mirrors hydratr's `HydratrPackageEvent` type. The base `OrderAndPackage`
 * type uses `Omit<Package, 'eventLog'>`, but hydratr adds eventLog back
 * when constructing the event from Lugus data before publishing to EventBridge.
 *
 * @see hydratr-webhook-hydration-service/src/utils/types.ts — HydratrPackageEvent
 */
export type EnrichedPackageEventWithEventLog = EnrichedPackageEvent & {
  entity: OrderAndPackage & {
    package: Package
  }
}

function splitFieldMappings(fieldMappings: FieldMapping[]): {
  topLevel: FieldMapping[]
  eventLevel: FieldMapping[]
} {
  const topLevel = fieldMappings.filter(m => !m.source.startsWith('eventLog.'))
  const eventLevel = fieldMappings
    .filter(m => m.source.startsWith('eventLog.'))
    .map(m => ({ ...m, source: m.source.replace(/^eventLog\./, '') }))
  return { topLevel, eventLevel }
}

function toRecord(obj: object): Record<string, unknown> {
  return obj as Record<string, unknown>
}

function resolveEventMessage(mapped: Record<string, unknown>): string {
  if (typeof mapped.message === 'string' && mapped.message !== '') {
    return mapped.message
  }
  const eventCode = mapped.originalEventCode as string | undefined
  if (eventCode) {
    return (
      SHOPIFY_SUPPLEMENTARY_EVENT_MESSAGES[eventCode] ||
      getHumanReadablePackageOperationText(eventCode) ||
      String(mapped.status ?? '')
    )
  }
  return String(mapped.status ?? '')
}

function buildTrackerEvents(
  eventLog: object[],
  eventMappings: FieldMapping[],
  statusMap: Record<string, string>
): TrackerEventAttributes[] {
  return eventLog
    .map(entry => {
      const mapped = applyFieldMapping(toRecord(entry), { mappings: eventMappings, statusMap })
      mapped.message = resolveEventMessage(mapped)
      return mapped
    })
    .filter(mapped => {
      const valid =
        typeof mapped.status === 'string' && typeof mapped.happenedAt === 'string' && typeof mapped.message === 'string'
      if (!valid) {
        log.warn(`Skipping event missing required fields (status, happenedAt, message): ${JSON.stringify(mapped)}`)
      }
      return valid
    }) as unknown as TrackerEventAttributes[]
}

function getConfigMappings(config: ClientConfig): {
  fieldMappings: FieldMapping[]
  statusMap: Record<string, string>
} {
  return {
    fieldMappings: config.fieldMappings,
    statusMap: config.statusMap,
  }
}

async function sendAndRecordDeliveryAttempt(
  trackerAttributes: TrackerAttributes,
  attemptInfo: { trackingNumber: string; clientId: string; trackerReferenceId: string; idempotencyKey: string }
): Promise<void> {
  let success = false
  try {
    await shopifyGraphqlAdapter.sendTrackerUpdate(trackerAttributes)
    success = true
  } finally {
    try {
      await transformDeliveryAttemptDataAccessor.create({
        ...attemptInfo,
        status: success ? 'success' : 'failure',
        occurredAt: new Date().toISOString(),
      })
    } catch (recordErr) {
      log.error('Failed to record delivery attempt', { error: recordErr })
    }
  }
}

async function resolveCoordinates(
  lugusLocation: { lat?: number | null; lng?: number | null } | null | undefined,
  platformFacilityId: string | null | undefined,
  facilityId: string | null | undefined
): Promise<{ lat: number; lng: number } | null> {
  if (lugusLocation?.lat != null && lugusLocation?.lng != null) {
    return { lat: lugusLocation.lat, lng: lugusLocation.lng }
  }

  if (platformFacilityId) {
    const coords = await janusAdapter.getFacilityCoordinates(platformFacilityId)
    if (coords) return coords
  }

  if (facilityId && facilityId !== platformFacilityId) {
    const coords = await janusAdapter.getFacilityCoordinates(facilityId)
    if (coords) return coords
  }

  log.warn('No coordinates available: no facilityId to query Janus')
  return null
}

export const transformationManager = {
  async processEnrichedPackageEvent(event: EnrichedPackageEventWithEventLog): Promise<void> {
    const trackingNumber = event.entity?.package?.trackingId
    if (!trackingNumber) {
      throw new Error('Enriched package event missing trackingId')
    }

    log.debug(`processEnrichedPackageEvent: start`, { trackingNumber, operation: event.operation })

    const subscription = await trackerSubscriptionDataAccessor.getByTrackingNumber(trackingNumber)
    if (!subscription) {
      log.debug(`processEnrichedPackageEvent: no subscription found`, { trackingNumber })
      return
    }

    log.debug(`processEnrichedPackageEvent: subscription found`, {
      trackingNumber,
      clientId: subscription.clientId,
      trackerReferenceId: subscription.trackerReferenceId,
      carrierId: subscription.carrierId,
    })

    const config = await clientConfigDataAccessor.getByClientId(subscription.clientId)
    if (!config) {
      throw new Error(`No client config found for clientId: ${subscription.clientId}`)
    }

    const { fieldMappings, statusMap } = getConfigMappings(config)
    const { topLevel, eventLevel } = splitFieldMappings(fieldMappings)
    const topLevelMapped = applyFieldMapping(toRecord(event), {
      mappings: topLevel,
      statusMap,
    })

    const lugusEvents = await lugusAdapter.getPackageEventHistory(trackingNumber)
    const lastLugusEvent = lugusEvents.at(-1)
    const events = lastLugusEvent ? buildTrackerEvents([lastLugusEvent], eventLevel, statusMap) : []

    // Resolve coordinates: try Lugus event location first, fall back to Janus facility

    log.info('Trying to get coordinates', {
      locationFromLugus: lastLugusEvent?.location,
      platformFacilityId: event.entity?.order?.platformFacilityId,
      facilityId: event.entity?.order?.facilityId,
    })
    const coordinates = await resolveCoordinates(
      lastLugusEvent?.location,
      event.entity?.order?.platformFacilityId,
      event.entity?.order?.facilityId
    )
    if (coordinates) {
      for (const evt of events) {
        evt.latitude = coordinates.lat
        evt.longitude = coordinates.lng
      }
    }

    const lastEventTimestamp = lastLugusEvent?.timestamp ?? ''
    const idempotencyKey = `${trackingNumber}:${event.operation ?? 'unknown'}:${lastEventTimestamp}`
    const trackerAttributes: TrackerAttributes = {
      ...topLevelMapped,
      trackingNumber,
      carrierId: subscription.carrierId,
      trackerReferenceId: subscription.trackerReferenceId,
      idempotencyKey,
      events,
    } as TrackerAttributes

    log.debug(`processEnrichedPackageEvent: sending tracker update`, {
      trackingNumber,
      trackerReferenceId: subscription.trackerReferenceId,
      idempotencyKey,
      eventCount: events.length,
      lugusEventCount: lugusEvents.length,
      trackerAttributes: JSON.stringify(trackerAttributes, null, 2),
    })

    await sendAndRecordDeliveryAttempt(trackerAttributes, {
      trackingNumber,
      clientId: subscription.clientId,
      trackerReferenceId: subscription.trackerReferenceId,
      idempotencyKey,
    })
  },

  async processStatusRequest(params: {
    trackingNumber: string
    webhookId: string
    idempotencyKey: string
  }): Promise<void> {
    const subscription = await trackerSubscriptionDataAccessor.getByTrackingNumber(params.trackingNumber)
    if (!subscription) {
      log.warn(`No subscription found for trackingNumber: ${params.trackingNumber}`)
      return
    }

    const config = await clientConfigDataAccessor.getByClientId(subscription.clientId)
    if (!config) {
      throw new Error(`No client config found for clientId: ${subscription.clientId}`)
    }

    const { fieldMappings, statusMap } = getConfigMappings(config)
    const { eventLevel } = splitFieldMappings(fieldMappings)
    const lugusEvents = await lugusAdapter.getPackageEventHistory(params.trackingNumber)
    const events = buildTrackerEvents(lugusEvents, eventLevel, statusMap)

    const trackerAttributes: TrackerAttributes = {
      trackingNumber: params.trackingNumber,
      carrierId: subscription.carrierId,
      trackerReferenceId: subscription.trackerReferenceId,
      webhookId: params.webhookId,
      idempotencyKey: params.idempotencyKey,
      events,
    }

    await sendAndRecordDeliveryAttempt(trackerAttributes, {
      trackingNumber: params.trackingNumber,
      clientId: subscription.clientId,
      trackerReferenceId: subscription.trackerReferenceId,
      idempotencyKey: params.idempotencyKey,
    })
  },

  async processInitialSubscription(params: {
    trackingNumber: string
    trackerReferenceId: string
    carrierId: string
  }): Promise<void> {
    const { clientId, packageLog } = await lugusAdapter.getPackageWithHistory(params.trackingNumber)
    if (!clientId) {
      throw new Error(`No clientId found in Lugus for trackingNumber: ${params.trackingNumber}`)
    }

    const now = new Date()
    const sixMonthsTtl = Math.floor(now.getTime() / 1000) + 180 * 24 * 60 * 60
    const subscription = await trackerSubscriptionDataAccessor.createIfNotExists({
      trackingNumber: params.trackingNumber,
      trackerReferenceId: params.trackerReferenceId,
      carrierId: params.carrierId,
      clientId,
      subscribedAt: now.toISOString(),
      ttl: sixMonthsTtl,
    })

    const config = await clientConfigDataAccessor.getByClientId(clientId)
    if (!config) {
      throw new Error(`No client config found for clientId: ${clientId}`)
    }

    const { fieldMappings, statusMap } = getConfigMappings(config)
    const { eventLevel } = splitFieldMappings(fieldMappings)
    const events = buildTrackerEvents(packageLog, eventLevel, statusMap)

    const idempotencyKey = ulid()
    const trackerAttributes: TrackerAttributes = {
      trackingNumber: params.trackingNumber,
      carrierId: subscription.carrierId,
      trackerReferenceId: subscription.trackerReferenceId,
      idempotencyKey,
      events,
    }

    await sendAndRecordDeliveryAttempt(trackerAttributes, {
      trackingNumber: params.trackingNumber,
      clientId,
      trackerReferenceId: subscription.trackerReferenceId,
      idempotencyKey,
    })
  },
}
