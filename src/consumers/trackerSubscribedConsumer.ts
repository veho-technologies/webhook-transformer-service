import type { TrackingSubscriptionCreatedEvent } from '@veho/event-types'
import { sqsEventBridgeHandler } from '@veho/lambda-utils'
import { log, wrapWithUncaughtErrorLogging } from '@veho/observability-sdk'
import type { EventBridgeEvent } from 'aws-lambda'

import { transformationManager } from '../managers/transformationManager'

const handleMessage = async (
  event: EventBridgeEvent<'TrackingSubscriptionCreated', TrackingSubscriptionCreatedEvent>
): Promise<void> => {
  const { payload } = event.detail
  log.info('Processing TrackingSubscriptionCreated event', { trackingNumber: payload.trackingNumber })

  await transformationManager.processInitialSubscription({
    trackingNumber: payload.trackingNumber,
    trackerReferenceId: payload.providerTrackerId,
    carrierId: payload.providerCarrierId,
  })
}

export const handler = wrapWithUncaughtErrorLogging(sqsEventBridgeHandler(handleMessage))
