import { DeleteItemCommand, GetItemCommand, PutItemCommand, ScanCommand } from 'dynamodb-toolbox'

import type { ClientConfig } from '../database'
import { clientConfigDataAccessor } from './clientConfigDataAccessor'

const mockSend = jest.fn()
const mockKey = jest.fn().mockReturnValue({ send: mockSend })
const mockItem = jest.fn().mockReturnValue({ send: mockSend })
const mockBuild = jest.fn().mockReturnValue({ key: mockKey, item: mockItem })

const mockEntities = jest.fn().mockReturnValue({ send: mockSend })
const mockTableBuild = jest.fn().mockReturnValue({ entities: mockEntities })

jest.mock('../database', () => ({
  ClientConfigEntity: { build: (...args: unknown[]) => mockBuild(...args) },
  clientConfigTable: { build: (...args: unknown[]) => mockTableBuild(...args) },
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

  describe('list', () => {
    it('should return all items from scan', async () => {
      const configs = [mockConfig, { ...mockConfig, clientId: 'client-456' }]
      mockSend.mockResolvedValue({ Items: configs })

      const result = await clientConfigDataAccessor.list()

      expect(result).toEqual(configs)
      expect(mockTableBuild).toHaveBeenCalledWith(ScanCommand)
      expect(mockEntities).toHaveBeenCalledWith(expect.anything())
    })

    it('should return empty array when no items exist', async () => {
      mockSend.mockResolvedValue({})

      const result = await clientConfigDataAccessor.list()

      expect(result).toEqual([])
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
