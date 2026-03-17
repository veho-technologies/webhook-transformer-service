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

  /**
   * Writes the subscription only if no record exists for the tracking number.
   * Uses a DynamoDB conditional write (`attribute_not_exists`) to avoid overwriting
   * an existing subscription's `subscribedAt` / `trackerReferenceId` on retries.
   * Returns the newly created subscription, or the existing one if it was already present.
   */
  async createIfNotExists(subscription: TrackerSubscription): Promise<TrackerSubscription> {
    try {
      await TrackerSubscriptionEntity.build(PutItemCommand)
        .item(subscription)
        .options({ condition: { attr: 'trackingNumber', exists: false } })
        .send()
      return subscription
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        const existing = await trackerSubscriptionDataAccessor.getByTrackingNumber(subscription.trackingNumber)
        return existing ?? subscription
      }
      throw error
    }
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
