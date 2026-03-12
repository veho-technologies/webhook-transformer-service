import { Entity, type FormattedItem, schema, Table } from 'dynamodb-toolbox'

import { DocumentClientSingleton } from './client'

export const transformDeliveryAttemptTable = new Table({
  name: process.env.TRANSFORM_DELIVERY_ATTEMPT_TABLE_NAME ?? 'webhook-transformer-delivery-attempt',
  partitionKey: { name: 'clientIdTrackingNumber', type: 'string' },
  sortKey: { name: 'id', type: 'string' },
  documentClient: DocumentClientSingleton.get(),
})

export const TransformDeliveryAttemptEntity = new Entity({
  name: 'TransformDeliveryAttempt',
  table: transformDeliveryAttemptTable,
  timestamps: false,
  schema: schema.item({
    clientIdTrackingNumber: schema.string().key(),
    id: schema.string().key(),
    trackingNumber: schema.string().required(),
    clientId: schema.string().required(),
    trackerReferenceId: schema.string().required(),
    status: schema.string().enum('success', 'failure').required(),
    responseStatus: schema.number().optional(),
    responseBody: schema.string().optional(),
    idempotencyKey: schema.string().optional(),
    occurredAt: schema.string().required(),
    timeToLive: schema.number().optional(),
  }),
})

export type TransformDeliveryAttempt = FormattedItem<typeof TransformDeliveryAttemptEntity>
