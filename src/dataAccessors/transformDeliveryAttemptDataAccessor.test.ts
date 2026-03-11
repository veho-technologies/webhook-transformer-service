import { TransformDeliveryAttemptEntity } from '../database/dynamo'
import { transformDeliveryAttemptDataAccessor } from './transformDeliveryAttemptDataAccessor'

const mockCreate = jest.fn()
const mockFind = jest.fn()

jest.mock('../database/dynamo', () => ({
  TransformDeliveryAttemptModel: {
    create: (...args: unknown[]) => mockCreate(...args),
    find: (...args: unknown[]) => mockFind(...args),
  },
}))

describe('transformDeliveryAttemptDataAccessor', () => {
  const mockAttemptInput: Omit<TransformDeliveryAttemptEntity, 'id' | 'timeToLive'> = {
    trackingNumber: 'TRK-123',
    clientId: 'client-123',
    trackerReferenceId: 'ref-456',
    status: 'success',
    responseStatus: 200,
    responseBody: '{"ok":true}',
    idempotencyKey: 'idem-key-1',
    occurredAt: '2024-01-01T00:00:00.000Z',
  }

  describe('create', () => {
    it('should set timeToLive to ~30 days from now', async () => {
      const now = Date.now()
      jest.spyOn(Date, 'now').mockReturnValue(now)
      mockCreate.mockResolvedValue({})

      await transformDeliveryAttemptDataAccessor.create(mockAttemptInput)

      const expectedTtl = Math.floor(now / 1000) + 30 * 24 * 60 * 60
      expect(mockCreate).toHaveBeenCalledWith({
        ...mockAttemptInput,
        timeToLive: expectedTtl,
      })

      jest.restoreAllMocks()
    })
  })

  describe('listByTrackingNumber', () => {
    it('should query by pk with limit', async () => {
      const mockAttempt = { ...mockAttemptInput, id: 'ulid-123', timeToLive: 1234567890 }
      mockFind.mockResolvedValue([mockAttempt])

      const result = await transformDeliveryAttemptDataAccessor.listByTrackingNumber('client-123', 'TRK-123', 10)

      expect(result).toEqual([mockAttempt])
      expect(mockFind).toHaveBeenCalledWith({ clientId: 'client-123', trackingNumber: 'TRK-123' }, { limit: 10 })
    })

    it('should query without limit when not provided', async () => {
      mockFind.mockResolvedValue([])

      await transformDeliveryAttemptDataAccessor.listByTrackingNumber('client-123', 'TRK-123')

      expect(mockFind).toHaveBeenCalledWith({ clientId: 'client-123', trackingNumber: 'TRK-123' }, { limit: undefined })
    })
  })
})
