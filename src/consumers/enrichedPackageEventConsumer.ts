import { log } from '@veho/observability-sdk'
import type { EventBridgeEvent } from 'aws-lambda'

import { type EnrichedPackageEventWithEventLog, transformationManager } from '../managers/transformationManager'

export const handler = async (
  event: EventBridgeEvent<'EnrichedPackageEvent', EnrichedPackageEventWithEventLog>
): Promise<void> => {
  const trackingNumber = event.detail.entity?.package?.trackingId
  log.info('Processing EnrichedPackageEvent event', { trackingNumber })

  await transformationManager.processEnrichedPackageEvent(event.detail)
}
