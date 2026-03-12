import { DeleteItemCommand, GetItemCommand, PutItemCommand } from 'dynamodb-toolbox'

import type { ClientConfig } from '../database'
import { clientConfigDataAccessor } from './clientConfigDataAccessor'

const mockSend = jest.fn()
const mockKey = jest.fn().mockReturnValue({ send: mockSend })
const mockItem = jest.fn().mockReturnValue({ send: mockSend })
const mockBuild = jest.fn().mockReturnValue({ key: mockKey, item: mockItem })

jest.mock('../database', () => ({
  ClientConfigEntity: { build: (...args: unknown[]) => mockBuild(...args) },
}))

describe('clientConfigDataAccessor', () => {
  const mockConfig: ClientConfig = {
    clientId: 'client-123',
    endpointType: 'shopify_graphql',
    endpointUrl: 'https://example.com/webhook',
    authType: 'oauth',
    fieldMappings: [{ source: 'status', target: 'fulfillment_status' }],
    statusMap: { delivered: 'delivered', in_transit: 'in_transit' },
  }

  beforeEach(() => jest.clearAllMocks())

  describe('getByClientId', () => {
    it('should return the item when found', async () => {
      mockSend.mockResolvedValue({ Item: mockConfig })

      const result = await clientConfigDataAccessor.getByClientId('client-123')

      expect(result).toEqual(mockConfig)
      expect(mockBuild).toHaveBeenCalledWith(GetItemCommand)
      expect(mockKey).toHaveBeenCalledWith({ clientId: 'client-123' })
    })

    it('should return undefined when not found', async () => {
      mockSend.mockResolvedValue({ Item: undefined })

      const result = await clientConfigDataAccessor.getByClientId('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  describe('create', () => {
    it('should put item and return input', async () => {
      mockSend.mockResolvedValue({})

      const result = await clientConfigDataAccessor.create(mockConfig)

      expect(result).toEqual(mockConfig)
      expect(mockBuild).toHaveBeenCalledWith(PutItemCommand)
      expect(mockItem).toHaveBeenCalledWith(mockConfig)
    })
  })

  describe('delete', () => {
    it('should call DeleteItemCommand with key', async () => {
      mockSend.mockResolvedValue({})

      await clientConfigDataAccessor.delete('client-123')

      expect(mockBuild).toHaveBeenCalledWith(DeleteItemCommand)
      expect(mockKey).toHaveBeenCalledWith({ clientId: 'client-123' })
    })
  })
})
