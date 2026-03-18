import { log } from '@veho/observability-sdk'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const trackingNumber = event.pathParameters?.trackingNumber
  if (!trackingNumber) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing trackingNumber' }) }
  }

  log.info('Getting subscription', { trackingNumber })

  const subscription = await trackerSubscriptionDataAccessor.getByTrackingNumber(trackingNumber)
  if (!subscription) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Subscription not found' }) }
  }

  return { statusCode: 200, body: JSON.stringify(subscription) }
}
