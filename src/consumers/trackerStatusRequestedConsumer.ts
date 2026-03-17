import type { TrackingStatusRequestedEvent } from '@veho/event-types'
import { log } from '@veho/observability-sdk'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { transformationManager } from '../managers/transformationManager'

export const handler = async (
  event: EventBridgeEvent<'TrackingStatusRequested', TrackingStatusRequestedEvent>
): Promise<void> => {
  const { payload } = event.detail
  log.info('Processing TrackingStatusRequested event', { providerTrackerId: payload.providerTrackerId })

  const subscriptions = await trackerSubscriptionDataAccessor.listByClientId(payload.clientId)
  const subscription = subscriptions.find(s => s.trackerReferenceId === payload.providerTrackerId)

  if (!subscription) {
    log.warn('No subscription found for providerTrackerId', { providerTrackerId: payload.providerTrackerId })
    return
  }

  await transformationManager.processStatusRequest({
    trackingNumber: subscription.trackingNumber,
    trackerReferenceId: subscription.trackerReferenceId,
    clientId: payload.clientId,
    webhookId: payload.providerWebhookId,
    idempotencyKey: payload.idempotencyKey,
  })
}
