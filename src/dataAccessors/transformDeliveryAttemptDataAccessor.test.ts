import { PutItemCommand, QueryCommand } from 'dynamodb-toolbox'

import type { TransformDeliveryAttempt } from '../database'
import { transformDeliveryAttemptDataAccessor } from './transformDeliveryAttemptDataAccessor'

const mockSend = jest.fn()
const mockItem = jest.fn().mockReturnValue({ send: mockSend })
const mockBuild = jest.fn().mockReturnValue({ item: mockItem })

const mockOptions = jest.fn().mockReturnValue({ send: mockSend })
const mockEntities = jest.fn().mockReturnValue({ send: mockSend, options: mockOptions })
const mockQuery = jest.fn().mockReturnValue({ entities: mockEntities })
const mockTableBuild = jest.fn().mockReturnValue({ query: mockQuery })

jest.mock('../database', () => ({
  TransformDeliveryAttemptEntity: { build: (...args: unknown[]) => mockBuild(...args) },
  transformDeliveryAttemptTable: { build: (...args: unknown[]) => mockTableBuild(...args) },
}))

jest.mock('ulid', () => ({ ulid: () => 'mock-ulid-123' }))

describe('transformDeliveryAttemptDataAccessor', () => {
  const mockAttemptInput: Omit<TransformDeliveryAttempt, 'id' | 'ttl' | 'clientIdTrackingNumber'> = {
    trackingNumber: 'TRK-123',
    clientId: 'client-123',
    trackerReferenceId: 'ref-456',
    status: 'success',
    responseStatus: 200,
    responseBody: '{"ok":true}',
    idempotencyKey: 'idem-key-1',
    occurredAt: '2024-01-01T00:00:00.000Z',
  }

  beforeEach(() => jest.clearAllMocks())

  describe('create', () => {
    it('should set id via ulid and ttl to ~30 days from now', async () => {
      const now = Date.now()
      jest.spyOn(Date, 'now').mockReturnValue(now)
      mockSend.mockResolvedValue({})

      const result = await transformDeliveryAttemptDataAccessor.create(mockAttemptInput)

      const expectedTtl = Math.floor(now / 1000) + 30 * 24 * 60 * 60
      expect(mockBuild).toHaveBeenCalledWith(PutItemCommand)
      expect(mockItem).toHaveBeenCalledWith({
        ...mockAttemptInput,
        id: 'mock-ulid-123',
        ttl: expectedTtl,
        clientIdTrackingNumber: 'client-123#TRK-123',
      })
      expect(result).toEqual({
        ...mockAttemptInput,
        id: 'mock-ulid-123',
        ttl: expectedTtl,
        clientIdTrackingNumber: 'client-123#TRK-123',
      })

      jest.restoreAllMocks()
    })
  })

  describe('listByTrackingNumber', () => {
    it('should query by composite key with limit', async () => {
      const mockAttempt = {
        ...mockAttemptInput,
        id: 'ulid-123',
        ttl: 1234567890,
        clientIdTrackingNumber: 'client-123#TRK-123',
      }
      mockSend.mockResolvedValue({ Items: [mockAttempt] })

      const result = await transformDeliveryAttemptDataAccessor.listByTrackingNumber('client-123', 'TRK-123', 10)

      expect(result).toEqual([mockAttempt])
      expect(mockTableBuild).toHaveBeenCalledWith(QueryCommand)
      expect(mockQuery).toHaveBeenCalledWith({ partition: 'client-123#TRK-123' })
      expect(mockOptions).toHaveBeenCalledWith({ limit: 10 })
    })

    it('should query without limit when not provided', async () => {
      mockSend.mockResolvedValue({ Items: [] })

      await transformDeliveryAttemptDataAccessor.listByTrackingNumber('client-123', 'TRK-123')

      expect(mockQuery).toHaveBeenCalledWith({ partition: 'client-123#TRK-123' })
      expect(mockOptions).not.toHaveBeenCalled()
    })
  })
})
