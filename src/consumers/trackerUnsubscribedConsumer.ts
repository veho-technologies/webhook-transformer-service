import type { TrackingSubscriptionDeletedEvent } from '@veho/event-types'
import { log } from '@veho/observability-sdk'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { trackerSubscriptionManager } from '../managers/trackerSubscriptionManager'

export const handler = async (
  event: EventBridgeEvent<'TrackingSubscriptionDeleted', TrackingSubscriptionDeletedEvent>
): Promise<void> => {
  const { payload } = event.detail
  log.info('Processing TrackingSubscriptionDeleted event', { providerTrackerId: payload.providerTrackerId })

  const subscriptions = await trackerSubscriptionDataAccessor.listByClientId(payload.clientId)
  const subscription = subscriptions.find(s => s.trackerReferenceId === payload.providerTrackerId)

  if (!subscription) {
    log.warn('No subscription found for providerTrackerId', { providerTrackerId: payload.providerTrackerId })
    return
  }

  await trackerSubscriptionManager.removeSubscription(subscription.trackingNumber)
}
