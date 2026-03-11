import { TrackerSubscriptionEntity } from '../database/dynamo'
import { trackerSubscriptionDataAccessor } from './trackerSubscriptionDataAccessor'

const mockGet = jest.fn()
const mockCreate = jest.fn()
const mockRemove = jest.fn()
const mockFind = jest.fn()

jest.mock('../database/dynamo', () => ({
  TrackerSubscriptionModel: {
    get: (...args: unknown[]) => mockGet(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    remove: (...args: unknown[]) => mockRemove(...args),
    find: (...args: unknown[]) => mockFind(...args),
  },
}))

describe('trackerSubscriptionDataAccessor', () => {
  const mockSubscription: TrackerSubscriptionEntity = {
    trackingNumber: 'TRK-123',
    trackerReferenceId: 'ref-456',
    carrierId: 'carrier-789',
    clientId: 'client-123',
    subscribedAt: '2024-01-01T00:00:00.000Z',
  }

  describe('getByTrackingNumber', () => {
    it('should return the item when found', async () => {
      mockGet.mockResolvedValue(mockSubscription)

      const result = await trackerSubscriptionDataAccessor.getByTrackingNumber('TRK-123')

      expect(result).toEqual(mockSubscription)
      expect(mockGet).toHaveBeenCalledWith({ trackingNumber: 'TRK-123' })
    })

    it('should return undefined when not found', async () => {
      mockGet.mockResolvedValue(undefined)

      const result = await trackerSubscriptionDataAccessor.getByTrackingNumber('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  describe('create', () => {
    it('should call model.create with subscription data', async () => {
      mockCreate.mockResolvedValue(mockSubscription)

      await trackerSubscriptionDataAccessor.create(mockSubscription)

      expect(mockCreate).toHaveBeenCalledWith(mockSubscription)
    })
  })

  describe('delete', () => {
    it('should call model.remove with trackingNumber', async () => {
      mockRemove.mockResolvedValue(undefined)

      await trackerSubscriptionDataAccessor.delete('TRK-123')

      expect(mockRemove).toHaveBeenCalledWith({ trackingNumber: 'TRK-123' })
    })
  })

  describe('listByClientId', () => {
    it('should query gs1 index with clientId', async () => {
      mockFind.mockResolvedValue([mockSubscription])

      const result = await trackerSubscriptionDataAccessor.listByClientId('client-123')

      expect(result).toEqual([mockSubscription])
      expect(mockFind).toHaveBeenCalledWith({ clientId: 'client-123' }, { index: 'gs1' })
    })
  })
})
