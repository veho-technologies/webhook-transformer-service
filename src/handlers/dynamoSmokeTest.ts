import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'
import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import { transformDeliveryAttemptDataAccessor } from '../dataAccessors/transformDeliveryAttemptDataAccessor'

export const handler = async () => {
  const results: Record<string, unknown> = {}

  // --- ClientConfig: upsert, get, delete ---
  const clientId = `smoke-test-${Date.now()}`

  const config = await clientConfigDataAccessor.upsert({
    clientId,
    endpointType: 'shopify_graphql',
    endpointUrl: 'https://example.com/webhook',
    authType: 'oauth',
    fieldMappings: [{ source: 'status', target: 'fulfillment_status' }],
    statusMap: { delivered: 'delivered' },
  })
  results.clientConfigCreated = config

  const fetched = await clientConfigDataAccessor.getByClientId(clientId)
  results.clientConfigFetched = fetched

  await clientConfigDataAccessor.delete(clientId)
  const deleted = await clientConfigDataAccessor.getByClientId(clientId)
  results.clientConfigDeletedVerified = deleted === undefined

  // --- TrackerSubscription: create, get, listByClientId, delete ---
  const trackingNumber = `TRK-SMOKE-${Date.now()}`

  const subscription = await trackerSubscriptionDataAccessor.create({
    trackingNumber,
    trackerReferenceId: 'ref-smoke',
    carrierId: 'carrier-smoke',
    clientId,
    subscribedAt: new Date().toISOString(),
  })
  results.subscriptionCreated = subscription

  const fetchedSub = await trackerSubscriptionDataAccessor.getByTrackingNumber(trackingNumber)
  results.subscriptionFetched = fetchedSub

  const listed = await trackerSubscriptionDataAccessor.listByClientId(clientId)
  results.subscriptionListedByClient = listed

  await trackerSubscriptionDataAccessor.delete(trackingNumber)
  const deletedSub = await trackerSubscriptionDataAccessor.getByTrackingNumber(trackingNumber)
  results.subscriptionDeletedVerified = deletedSub === undefined

  // --- TransformDeliveryAttempt: create, list ---
  const attempt = await transformDeliveryAttemptDataAccessor.create({
    trackingNumber,
    clientId,
    trackerReferenceId: 'ref-smoke',
    status: 'success',
    responseStatus: 200,
    responseBody: '{"ok":true}',
    idempotencyKey: `idem-smoke-${Date.now()}`,
    occurredAt: new Date().toISOString(),
  })
  results.attemptCreated = attempt

  const attempts = await transformDeliveryAttemptDataAccessor.listByTrackingNumber(clientId, trackingNumber)
  results.attemptListed = attempts

  return {
    statusCode: 200,
    body: JSON.stringify(results, null, 2),
  }
}
