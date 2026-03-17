import type { EnrichedPackageEvent, OrderAndPackage, Package } from '@veho/events'
import { log } from '@veho/observability-sdk'
import { ulid } from 'ulid'

import { lugusAdapter } from '../adapters/lugusAdapter'
import { shopifyGraphqlAdapter } from '../adapters/shopifyGraphqlAdapter'
import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'
import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { transformDeliveryAttemptDataAccessor } from '../dataAccessors/transformDeliveryAttemptDataAccessor'
import type { ClientConfig } from '../database'
import { applyFieldMapping, type FieldMapping } from '../transformers/fieldMappingEngine'
import type { TrackerAttributes, TrackerEvent } from '../types/shopifyTypes'

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

function buildTrackerEvents(
  eventLog: object[],
  eventMappings: FieldMapping[],
  statusMap: Record<string, string>
): TrackerEvent[] {
  return eventLog
    .map(entry => applyFieldMapping(toRecord(entry), { mappings: eventMappings, statusMap }))
    .filter(mapped => {
      const valid =
        typeof mapped.status === 'string' && typeof mapped.happenedAt === 'string' && typeof mapped.message === 'string'
      if (!valid) {
        log.warn(`Skipping event missing required fields (status, happenedAt, message): ${JSON.stringify(mapped)}`)
      }
      return valid
    }) as unknown as TrackerEvent[]
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

export const transformationManager = {
  async processEnrichedPackageEvent(event: EnrichedPackageEventWithEventLog): Promise<void> {
    const trackingNumber = event.entity?.package?.trackingId
    if (!trackingNumber) {
      log.warn('Enriched package event missing trackingId — skipping')
      return
    }

    const subscription = await trackerSubscriptionDataAccessor.getByTrackingNumber(trackingNumber)
    if (!subscription) {
      return
    }

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

    const rawEventLog = event.entity.package.eventLog ?? []
    const events = buildTrackerEvents(rawEventLog, eventLevel, statusMap)

    const lastEventTimestamp = rawEventLog.at(-1)?.timestamp ?? ''
    const idempotencyKey = `${trackingNumber}:${event.operation ?? 'unknown'}:${lastEventTimestamp}`
    const trackerAttributes: TrackerAttributes = {
      ...topLevelMapped,
      trackingNumber,
      carrierId: subscription.carrierId,
      events,
    } as TrackerAttributes

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(
      trackerAttributes,
      subscription.trackerReferenceId,
      idempotencyKey
    )

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
      events,
    }

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(
      trackerAttributes,
      params.webhookId,
      params.idempotencyKey
    )

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

    const idempotencyKey = ulid()
    const trackerAttributes: TrackerAttributes = {
      trackingNumber: params.trackingNumber,
      carrierId: subscription.carrierId,
      events,
    }

    const result = await shopifyGraphqlAdapter.sendTrackerUpdate(
      trackerAttributes,
      subscription.trackerReferenceId,
      idempotencyKey
    )

    await transformDeliveryAttemptDataAccessor.create({
      trackingNumber: params.trackingNumber,
      clientId,
      trackerReferenceId: subscription.trackerReferenceId,
      status: result.success ? 'success' : 'failure',
      idempotencyKey,
      occurredAt: new Date().toISOString(),
    })
  },
}
