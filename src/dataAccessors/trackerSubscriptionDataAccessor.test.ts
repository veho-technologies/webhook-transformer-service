import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from 'dynamodb-toolbox'

import type { TrackerSubscription } from '../database'
import { trackerSubscriptionDataAccessor } from './trackerSubscriptionDataAccessor'

const mockSend = jest.fn()
const mockKey = jest.fn().mockReturnValue({ send: mockSend })
const mockItem = jest.fn().mockReturnValue({ send: mockSend })
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
})
