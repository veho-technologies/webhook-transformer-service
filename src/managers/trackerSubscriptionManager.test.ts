import type { TrackerSubscription } from '../database'
import { trackerSubscriptionManager } from './trackerSubscriptionManager'

const mockGetByTrackingNumber = jest.fn()
const mockCreate = jest.fn()
const mockDelete = jest.fn()

jest.mock('../dataAccessors/trackerSubscriptionDataAccessor', () => ({
  trackerSubscriptionDataAccessor: {
    getByTrackingNumber: (...args: unknown[]) => mockGetByTrackingNumber(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

describe('trackerSubscriptionManager', () => {
  const mockSubscription: TrackerSubscription = {
    trackingNumber: 'TRK-123',
    trackerReferenceId: 'ref-456',
    carrierId: 'carrier-789',
    clientId: 'client-123',
    subscribedAt: '2024-01-01T00:00:00.000Z',
  }

  beforeEach(() => jest.clearAllMocks())

  describe('createSubscription', () => {
    it('should create when no existing subscription', async () => {
      mockGetByTrackingNumber.mockResolvedValue(undefined)
      mockCreate.mockResolvedValue(mockSubscription)

      await trackerSubscriptionManager.createSubscription(mockSubscription)

      expect(mockGetByTrackingNumber).toHaveBeenCalledWith('TRK-123')
      expect(mockCreate).toHaveBeenCalledWith(mockSubscription)
    })

    it('should skip creation when subscription already exists', async () => {
      mockGetByTrackingNumber.mockResolvedValue(mockSubscription)

      await trackerSubscriptionManager.createSubscription(mockSubscription)

      expect(mockGetByTrackingNumber).toHaveBeenCalledWith('TRK-123')
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('removeSubscription', () => {
    it('should delete when subscription exists', async () => {
      mockGetByTrackingNumber.mockResolvedValue(mockSubscription)
      mockDelete.mockResolvedValue(undefined)

      await trackerSubscriptionManager.removeSubscription('TRK-123')

      expect(mockGetByTrackingNumber).toHaveBeenCalledWith('TRK-123')
      expect(mockDelete).toHaveBeenCalledWith('TRK-123')
    })

    it('should skip deletion when subscription not found', async () => {
      mockGetByTrackingNumber.mockResolvedValue(undefined)

      await trackerSubscriptionManager.removeSubscription('TRK-123')

      expect(mockGetByTrackingNumber).toHaveBeenCalledWith('TRK-123')
      expect(mockDelete).not.toHaveBeenCalled()
    })
  })
})
