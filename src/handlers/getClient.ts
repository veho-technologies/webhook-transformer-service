import { log } from '@veho/observability-sdk'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const clientId = event.pathParameters?.clientId
  if (!clientId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing clientId' }) }
  }

  log.info('Getting client config', { clientId })

  const config = await clientConfigDataAccessor.getByClientId(clientId)
  if (!config) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Client not found' }) }
  }

  return { statusCode: 200, body: JSON.stringify(config) }
}
