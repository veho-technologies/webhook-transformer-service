import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { oneTableLogging } from '@veho/observability-sdk'
import AWSXRay from 'aws-xray-sdk-core'
import { Entity, Table } from 'dynamodb-onetable'
import { Dynamo } from 'dynamodb-onetable/Dynamo'
import { ulid } from 'ulid'

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined

const client = isTest
  ? new Dynamo({ client: new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'us-east-1' }) })
  : new Dynamo({ client: AWSXRay.captureAWSv3Client(new DynamoDBClient({})) })

export const schema = {
  version: '0.0.1',
  format: 'onetable:1.1.0',
  indexes: {
    primary: { hash: 'pk', sort: 'sk' },
    gs1: { hash: 'gs1pk', sort: 'gs1sk', project: 'all' as const },
  },
  params: {
    isoDates: true,
    timestamps: true,
    createdField: 'createdAt',
    updatedField: 'updatedAt',
  },
  models: {
    ClientConfig: {
      pk: { type: String, value: 'clientConfig:${clientId}' },
      sk: { type: String, value: 'clientConfig:${clientId}' },
      clientId: { type: String, required: true },
      endpointType: { type: String, required: true, enum: ['shopify_graphql'] },
      endpointUrl: { type: String, required: true },
      authType: { type: String, required: true, enum: ['oauth', 'api_key'] },
      fieldMappings: { type: Array, required: true },
      statusMap: { type: Object, required: true },
      createdAt: { type: String },
      updatedAt: { type: String },
    },
    TrackerSubscription: {
      pk: { type: String, value: 'subscription:${trackingNumber}' },
      sk: { type: String, value: 'subscription:${trackingNumber}' },
      gs1pk: { type: String, value: 'client:${clientId}' },
      gs1sk: { type: String, value: '${subscribedAt}' },
      trackingNumber: { type: String, required: true },
      trackerReferenceId: { type: String, required: true },
      carrierId: { type: String, required: true },
      clientId: { type: String, required: true },
      destinationPostalCode: { type: String },
      subscribedAt: { type: String, required: true },
      updatedAt: { type: String },
    },
    TransformDeliveryAttempt: {
      pk: { type: String, value: 'attempt:${clientId}:${trackingNumber}' },
      sk: { type: String, value: 'attempt:${id}' },
      id: { type: String, generate: 'ulid' },
      trackingNumber: { type: String, required: true },
      clientId: { type: String, required: true },
      trackerReferenceId: { type: String, required: true },
      status: { type: String, required: true, enum: ['success', 'failure'] },
      responseStatus: { type: Number },
      responseBody: { type: String },
      idempotencyKey: { type: String },
      occurredAt: { type: String, required: true },
      timeToLive: { type: Number },
    },
  } as const,
} as const

export type ClientConfigEntity = Entity<typeof schema.models.ClientConfig>
export type TrackerSubscriptionEntity = Entity<typeof schema.models.TrackerSubscription>
export type TransformDeliveryAttemptEntity = Entity<typeof schema.models.TransformDeliveryAttempt>

export const table = new Table({
  name: process.env.TABLE_NAME ?? 'webhook-transformer-service',
  client,
  schema,
  logger: process.env.DB_LOGGING ? oneTableLogging : undefined,
  generate: ulid,
  partial: true,
})

export const ClientConfigModel = table.getModel<ClientConfigEntity>('ClientConfig')
export const TrackerSubscriptionModel = table.getModel<TrackerSubscriptionEntity>('TrackerSubscription')
export const TransformDeliveryAttemptModel = table.getModel<TransformDeliveryAttemptEntity>('TransformDeliveryAttempt')
