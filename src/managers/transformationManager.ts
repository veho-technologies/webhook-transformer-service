import { getHumanReadablePackageOperationText } from '@veho/client-api-contract'
import type { EnrichedPackageEvent, OrderAndPackage, Package } from '@veho/events'
import { log } from '@veho/observability-sdk'

import { type FacilityLocation, janusAdapter } from '../adapters/janusAdapter'
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

async function resolveLocation(
  lugusLocation: { lat?: number | null; lng?: number | null } | null | undefined,
  platformFacilityId: string | null | undefined,
  facilityId: string | null | undefined
): Promise<FacilityLocation | null> {
  // Always try Janus — it's the only source of city
  let janusLocation: FacilityLocation | null = null
  if (platformFacilityId) {
    janusLocation = await janusAdapter.getFacilityLocation(platformFacilityId)
  }
  if (!janusLocation && facilityId && facilityId !== platformFacilityId) {
    janusLocation = await janusAdapter.getFacilityLocation(facilityId)
  }

  // Prefer Lugus coordinates over Janus, combine with Janus city
  if (lugusLocation?.lat != null && lugusLocation?.lng != null && janusLocation?.city) {
    return { lat: lugusLocation.lat, lng: lugusLocation.lng, city: janusLocation.city }
  }

  // Janus provides all three (lat, lng, city)
  if (janusLocation) return janusLocation

  log.warn('No location available: no facilityId to query Janus')
  return null
}

export const transformationManager = {
  async processEnrichedPackageEvent(event: EnrichedPackageEventWithEventLog): Promise<void> {
    const trackingNumber = event.entity?.package?.trackingId
    if (!trackingNumber) {
      log.warn('Enriched package event missing trackingId — skipping')
      return
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
      log.warn(`No client config found for clientId: ${subscription.clientId}`)
      return
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

    // Resolve location: try Lugus event location first, fall back to Janus facility

    log.info('Trying to get location', {
      locationFromLugus: lastLugusEvent?.location,
      platformFacilityId: event.entity?.order?.platformFacilityId,
      facilityId: event.entity?.order?.facilityId,
    })
    const location = await resolveLocation(
      lastLugusEvent?.location,
      event.entity?.order?.platformFacilityId,
      event.entity?.order?.facilityId
    )
    if (location) {
      for (const evt of events) {
        evt.latitude = location.lat
        evt.longitude = location.lng
        evt.city = location.city
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

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(trackerAttributes)

    if (!result.success) {
      log.error(`processEnrichedPackageEvent: sendTrackerUpdate failed`, {
        trackingNumber,
        trackerReferenceId: subscription.trackerReferenceId,
        idempotencyKey,
        clientId: subscription.clientId,
        errors: result.errors,
        trackerAttributes: JSON.stringify(trackerAttributes, null, 2),
      })
    } else {
      log.debug(`processEnrichedPackageEvent: sendTrackerUpdate succeeded`, {
        trackingNumber,
        idempotencyKey,
      })
    }

    await transformDeliveryAttemptDataAccessor.create({
      trackingNumber,
      clientId: subscription.clientId,
      trackerReferenceId: subscription.trackerReferenceId,
      status: result.success ? 'success' : 'failure',
      idempotencyKey,
      occurredAt: new Date().toISOString(),
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
      log.warn(`No client config found for clientId: ${subscription.clientId}`)
      return
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

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(trackerAttributes)

    await transformDeliveryAttemptDataAccessor.create({
      trackingNumber: params.trackingNumber,
      clientId: subscription.clientId,
      trackerReferenceId: subscription.trackerReferenceId,
      status: result.success ? 'success' : 'failure',
      idempotencyKey: params.idempotencyKey,
      occurredAt: new Date().toISOString(),
    })
  },

  async processInitialSubscription(params: {
    trackingNumber: string
    trackerReferenceId: string
    carrierId: string
    webhookId: string
    idempotencyKey: string
  }): Promise<void> {
    const { clientId, packageLog } = await lugusAdapter.getPackageWithHistory(params.trackingNumber)
    if (!clientId) {
      log.warn(`No clientId found in Lugus for trackingNumber: ${params.trackingNumber}`)
      return
    }

    const now = new Date()
    const sixMonthsTtl = Math.floor(now.getTime() / 1000) + 180 * 24 * 60 * 60
    const subscription = await trackerSubscriptionDataAccessor.createIfNotExists({
      trackingNumber: params.trackingNumber,
      trackerReferenceId: params.trackerReferenceId,
      carrierId: params.carrierId,
      webhookId: params.webhookId,
      clientId,
      subscribedAt: now.toISOString(),
      ttl: sixMonthsTtl,
    })

    const config = await clientConfigDataAccessor.getByClientId(clientId)
    if (!config) {
      log.warn(`No client config found for clientId: ${clientId}`)
      return
    }

    const { fieldMappings, statusMap } = getConfigMappings(config)
    const { eventLevel } = splitFieldMappings(fieldMappings)
    const events = buildTrackerEvents(packageLog, eventLevel, statusMap)

    const trackerAttributes: TrackerAttributes = {
      trackingNumber: params.trackingNumber,
      carrierId: subscription.carrierId,
      trackerReferenceId: subscription.trackerReferenceId,
      webhookId: subscription.webhookId,
      idempotencyKey: params.idempotencyKey,
      events,
    }

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(trackerAttributes)

    await transformDeliveryAttemptDataAccessor.create({
      trackingNumber: params.trackingNumber,
      clientId,
      trackerReferenceId: subscription.trackerReferenceId,
      status: result.success ? 'success' : 'failure',
      idempotencyKey: params.idempotencyKey,
      occurredAt: new Date().toISOString(),
    })
  },
}
