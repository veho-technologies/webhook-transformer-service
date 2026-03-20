import type { TrackingStatusRequestedEvent } from '@veho/event-types'
import { sqsEventBridgeHandler } from '@veho/lambda-utils'
import { log, wrapWithUncaughtErrorLogging } from '@veho/observability-sdk'
import type { EventBridgeEvent } from 'aws-lambda'

import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { transformationManager } from '../managers/transformationManager'

const handleMessage = async (
  event: EventBridgeEvent<'TrackingStatusRequested', TrackingStatusRequestedEvent>
): Promise<void> => {
  const { payload } = event.detail
  log.info('Processing TrackingStatusRequested event', { providerTrackerId: payload.providerTrackerId })

  const subscription = await trackerSubscriptionDataAccessor.getByTrackerReferenceId(payload.providerTrackerId)

  if (!subscription) {
    log.warn('No subscription found for providerTrackerId', { providerTrackerId: payload.providerTrackerId })
    return
  }

  await transformationManager.processStatusRequest({
    trackingNumber: subscription.trackingNumber,
    webhookId: payload.providerWebhookId,
    idempotencyKey: payload.idempotencyKey,
  })
}

export const handler = sqsEventBridgeHandler(wrapWithUncaughtErrorLogging(handleMessage))
