import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from 'dynamodb-toolbox'

import type { TrackerSubscription } from '../database'
import { trackerSubscriptionDataAccessor } from './trackerSubscriptionDataAccessor'

const mockSend = jest.fn()
const mockKey = jest.fn().mockReturnValue({ send: mockSend })
const mockOptions = jest.fn().mockReturnValue({ send: mockSend })
const mockItem = jest.fn().mockReturnValue({ send: mockSend, options: mockOptions })
const mockBuild = jest.fn().mockReturnValue({ key: mockKey, item: mockItem })

const mockEntities = jest.fn().mockReturnValue({ send: mockSend })
const mockQuery = jest.fn().mockReturnValue({ entities: mockEntities })
const mockTableBuild = jest.fn().mockReturnValue({ query: mockQuery })

jest.mock('../database', () => ({
  TrackerSubscriptionEntity: { build: (...args: unknown[]) => mockBuild(...args) },
  trackerSubscriptionTable: { build: (...args: unknown[]) => mockTableBuild(...args) },
}))

describe('trackerSubscriptionDataAccessor', () => {
  const mockSubscription: TrackerSubscription = {
    trackingNumber: 'TRK-123',
    trackerReferenceId: 'ref-456',
    carrierId: 'carrier-789',
    clientId: 'client-123',
    subscribedAt: '2024-01-01T00:00:00.000Z',
  }

  beforeEach(() => jest.clearAllMocks())

  describe('getByTrackingNumber', () => {
    it('should return the item when found', async () => {
      mockSend.mockResolvedValue({ Item: mockSubscription })

      const result = await trackerSubscriptionDataAccessor.getByTrackingNumber('TRK-123')

      expect(result).toEqual(mockSubscription)
      expect(mockBuild).toHaveBeenCalledWith(GetItemCommand)
      expect(mockKey).toHaveBeenCalledWith({ trackingNumber: 'TRK-123' })
    })

    it('should return undefined when not found', async () => {
      mockSend.mockResolvedValue({ Item: undefined })

      const result = await trackerSubscriptionDataAccessor.getByTrackingNumber('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  describe('create', () => {
    it('should put item and return input', async () => {
      mockSend.mockResolvedValue({})

      const result = await trackerSubscriptionDataAccessor.create(mockSubscription)

      expect(result).toEqual(mockSubscription)
      expect(mockBuild).toHaveBeenCalledWith(PutItemCommand)
      expect(mockItem).toHaveBeenCalledWith(mockSubscription)
    })
  })

  describe('createIfNotExists', () => {
    it('should put item with attribute_not_exists condition and return input when no conflict', async () => {
      mockSend.mockResolvedValue({})

      const result = await trackerSubscriptionDataAccessor.createIfNotExists(mockSubscription)

      expect(result).toEqual(mockSubscription)
      expect(mockBuild).toHaveBeenCalledWith(PutItemCommand)
      expect(mockItem).toHaveBeenCalledWith(mockSubscription)
      expect(mockOptions).toHaveBeenCalledWith({ condition: { attr: 'trackingNumber', exists: false } })
    })

    it('should return the existing subscription when ConditionalCheckFailedException is thrown', async () => {
      const conditionalError = Object.assign(new Error('ConditionalCheckFailedException'), {
        name: 'ConditionalCheckFailedException',
      })
      mockSend.mockRejectedValueOnce(conditionalError)
      mockSend.mockResolvedValueOnce({ Item: mockSubscription })

      const result = await trackerSubscriptionDataAccessor.createIfNotExists(mockSubscription)

      expect(result).toEqual(mockSubscription)
    })

    it('should re-throw errors that are not ConditionalCheckFailedException', async () => {
      mockSend.mockRejectedValue(new Error('ProvisionedThroughputExceededException'))

      await expect(trackerSubscriptionDataAccessor.createIfNotExists(mockSubscription)).rejects.toThrow(
        'ProvisionedThroughputExceededException'
      )
    })
  })

  describe('delete', () => {
    it('should call DeleteItemCommand with key', async () => {
      mockSend.mockResolvedValue({})

      await trackerSubscriptionDataAccessor.delete('TRK-123')

      expect(mockBuild).toHaveBeenCalledWith(DeleteItemCommand)
      expect(mockKey).toHaveBeenCalledWith({ trackingNumber: 'TRK-123' })
    })
  })

  describe('listByClientId', () => {
    it('should query byClientId index with clientId', async () => {
      mockSend.mockResolvedValue({ Items: [mockSubscription] })

      const result = await trackerSubscriptionDataAccessor.listByClientId('client-123')

      expect(result).toEqual([mockSubscription])
      expect(mockTableBuild).toHaveBeenCalledWith(QueryCommand)
      expect(mockQuery).toHaveBeenCalledWith({ index: 'byClientId', partition: 'client-123' })
    })
  })

  describe('getByTrackerReferenceId', () => {
    it('should return the first item from byTrackerReferenceId index', async () => {
      mockSend.mockResolvedValue({ Items: [mockSubscription] })

      const result = await trackerSubscriptionDataAccessor.getByTrackerReferenceId('ref-456')

      expect(result).toEqual(mockSubscription)
      expect(mockTableBuild).toHaveBeenCalledWith(QueryCommand)
      expect(mockQuery).toHaveBeenCalledWith({ index: 'byTrackerReferenceId', partition: 'ref-456' })
    })

    it('should return undefined when no items found', async () => {
      mockSend.mockResolvedValue({ Items: [] })

      const result = await trackerSubscriptionDataAccessor.getByTrackerReferenceId('nonexistent')

      expect(result).toBeUndefined()
    })
  })
})
