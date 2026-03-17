import type { TrackingSubscriptionCreatedEvent } from '@veho/event-types'
import { log } from '@veho/observability-sdk'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionManager } from '../managers/trackerSubscriptionManager'
import { transformationManager } from '../managers/transformationManager'

export const handler = async (
  event: EventBridgeEvent<'TrackingSubscriptionCreated', TrackingSubscriptionCreatedEvent>
): Promise<void> => {
  const { payload } = event.detail
  log.info('Processing TrackingSubscriptionCreated event', { trackingNumber: payload.trackingNumber })

  await trackerSubscriptionManager.createSubscription({
    trackingNumber: payload.trackingNumber,
    trackerReferenceId: payload.providerTrackerId,
    carrierId: payload.providerCarrierId,
    clientId: payload.clientId,
    destinationPostalCode: payload.providerDestinationPostalCode ?? undefined,
    subscribedAt: event.detail.eventDateTime,
  })

  await transformationManager.processInitialSubscription({
    trackingNumber: payload.trackingNumber,
    trackerReferenceId: payload.providerTrackerId,
    carrierId: payload.providerCarrierId,
  })
}
