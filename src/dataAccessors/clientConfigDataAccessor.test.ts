import { ClientConfigEntity } from '../database/dynamo'
import { clientConfigDataAccessor } from './clientConfigDataAccessor'

const mockGet = jest.fn()
const mockUpsert = jest.fn()
const mockRemove = jest.fn()

jest.mock('../database/dynamo', () => ({
  ClientConfigModel: {
    get: (...args: unknown[]) => mockGet(...args),
    upsert: (...args: unknown[]) => mockUpsert(...args),
    remove: (...args: unknown[]) => mockRemove(...args),
  },
}))

describe('clientConfigDataAccessor', () => {
  const mockConfig: ClientConfigEntity = {
    clientId: 'client-123',
    endpointType: 'shopify_graphql',
    endpointUrl: 'https://example.com/webhook',
    authType: 'oauth',
    fieldMappings: [{ source: 'status', target: 'fulfillment_status' }],
    statusMap: { delivered: 'delivered', in_transit: 'in_transit' },
  }

  describe('getByClientId', () => {
    it('should return the item when found', async () => {
      mockGet.mockResolvedValue(mockConfig)

      const result = await clientConfigDataAccessor.getByClientId('client-123')

      expect(result).toEqual(mockConfig)
      expect(mockGet).toHaveBeenCalledWith({ clientId: 'client-123' })
    })

    it('should return undefined when not found', async () => {
      mockGet.mockResolvedValue(undefined)

      const result = await clientConfigDataAccessor.getByClientId('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  describe('upsert', () => {
    it('should call model.upsert with correct data', async () => {
      mockUpsert.mockResolvedValue(mockConfig)

      await clientConfigDataAccessor.upsert(mockConfig)

      expect(mockUpsert).toHaveBeenCalledWith(mockConfig)
    })
  })

  describe('delete', () => {
    it('should call model.remove with clientId', async () => {
      mockRemove.mockResolvedValue(undefined)

      await clientConfigDataAccessor.delete('client-123')

      expect(mockRemove).toHaveBeenCalledWith({ clientId: 'client-123' })
    })
  })
})
