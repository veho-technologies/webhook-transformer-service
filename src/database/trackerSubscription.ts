import { Entity, type FormattedItem, schema, Table } from 'dynamodb-toolbox'

import { DocumentClientSingleton } from './client'

export const trackerSubscriptionTable = new Table({
  name: process.env.TRACKER_SUBSCRIPTION_TABLE_NAME ?? 'webhook-transformer-tracker-subscription',
  partitionKey: { name: 'trackingNumber', type: 'string' },
  indexes: {
    byClientId: {
      type: 'global' as const,
      partitionKey: { name: 'clientId', type: 'string' },
      sortKey: { name: 'subscribedAt', type: 'string' },
    },
    // No sort key — trackerReferenceId (Shopify's providerTrackerId) is unique per subscription (1:1 with trackingNumber)
    byTrackerReferenceId: {
      type: 'global' as const,
      partitionKey: { name: 'trackerReferenceId', type: 'string' },
    },
  },
  documentClient: DocumentClientSingleton.get(),
})

export const TrackerSubscriptionEntity = new Entity({
  name: 'TrackerSubscription',
  table: trackerSubscriptionTable,
  timestamps: false,
  schema: schema.item({
    trackingNumber: schema.string().key(),
    trackerReferenceId: schema.string().required(),
    carrierId: schema.string().required(),
    clientId: schema.string().required(),
    destinationPostalCode: schema.string().optional(),
    subscribedAt: schema.string().required(),
  }),
})

export type TrackerSubscription = FormattedItem<typeof TrackerSubscriptionEntity>
