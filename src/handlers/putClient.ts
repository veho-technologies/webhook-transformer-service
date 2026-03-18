import { log } from '@veho/observability-sdk'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const clientId = event.pathParameters?.clientId
  if (!clientId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing clientId' }) }
  }

  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) }
  }

  log.info('Upserting client config', { clientId })

  const body = JSON.parse(event.body)
  const config = await clientConfigDataAccessor.create({ ...body, clientId })

  return { statusCode: 200, body: JSON.stringify(config) }
}
