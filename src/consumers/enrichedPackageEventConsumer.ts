import { sqsEventBridgeHandler } from '@veho/lambda-utils'
import { log, wrapWithUncaughtErrorLogging } from '@veho/observability-sdk'
import type { EventBridgeEvent } from 'aws-lambda'

import { type EnrichedPackageEventWithEventLog, transformationManager } from '../managers/transformationManager'

const handleMessage = async (
  event: EventBridgeEvent<'EnrichedPackageEvent', EnrichedPackageEventWithEventLog>
): Promise<void> => {
  const trackingNumber = event.detail.entity?.package?.trackingId
  log.info('Processing EnrichedPackageEvent event', { trackingNumber })

  await transformationManager.processEnrichedPackageEvent(event.detail)
}

export const handler = sqsEventBridgeHandler(wrapWithUncaughtErrorLogging(handleMessage))
