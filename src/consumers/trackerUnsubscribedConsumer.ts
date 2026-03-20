import type { TrackingSubscriptionDeletedEvent } from '@veho/event-types'
import { sqsEventBridgeHandler } from '@veho/lambda-utils'
import { log, wrapWithUncaughtErrorLogging } from '@veho/observability-sdk'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { trackerSubscriptionManager } from '../managers/trackerSubscriptionManager'

const handleMessage = async (
  event: EventBridgeEvent<'TrackingSubscriptionDeleted', TrackingSubscriptionDeletedEvent>
): Promise<void> => {
  const { payload } = event.detail
  log.info('Processing TrackingSubscriptionDeleted event', { providerTrackerId: payload.providerTrackerId })

  const subscription = await trackerSubscriptionDataAccessor.getByTrackerReferenceId(payload.providerTrackerId)

  if (!subscription) {
    log.warn('No subscription found for providerTrackerId', { providerTrackerId: payload.providerTrackerId })
    return
  }

  await trackerSubscriptionManager.removeSubscription(subscription.trackingNumber)
}

export const handler = sqsEventBridgeHandler(wrapWithUncaughtErrorLogging(handleMessage))
