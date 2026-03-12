import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from 'dynamodb-toolbox'

import { type TrackerSubscription, TrackerSubscriptionEntity, trackerSubscriptionTable } from '../database'

export const trackerSubscriptionDataAccessor = {
  async getByTrackingNumber(trackingNumber: string): Promise<TrackerSubscription | undefined> {
    const { Item } = await TrackerSubscriptionEntity.build(GetItemCommand).key({ trackingNumber }).send()
    return Item
  },

  async create(subscription: TrackerSubscription): Promise<TrackerSubscription> {
    await TrackerSubscriptionEntity.build(PutItemCommand).item(subscription).send()
    return subscription
  },

  async delete(trackingNumber: string): Promise<void> {
    await TrackerSubscriptionEntity.build(DeleteItemCommand).key({ trackingNumber }).send()
  },

  async listByClientId(clientId: string): Promise<TrackerSubscription[]> {
    const { Items = [] } = await trackerSubscriptionTable
      .build(QueryCommand)
      .query({ index: 'byClientId', partition: clientId })
      .entities(TrackerSubscriptionEntity)
      .send()
    return Items
  },
}
