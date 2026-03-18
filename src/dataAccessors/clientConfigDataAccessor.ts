import { DeleteItemCommand, GetItemCommand, PutItemCommand, ScanCommand } from 'dynamodb-toolbox'

import { type ClientConfig, ClientConfigEntity, clientConfigTable } from '../database'

export const clientConfigDataAccessor = {
  async getByClientId(clientId: string): Promise<ClientConfig | undefined> {
    const { Item } = await ClientConfigEntity.build(GetItemCommand).key({ clientId }).send()
    return Item
  },

  async list(): Promise<ClientConfig[]> {
    const { Items = [] } = await clientConfigTable.build(ScanCommand).entities(ClientConfigEntity).send()
    return Items
  },

  async create(config: ClientConfig): Promise<ClientConfig> {
    await ClientConfigEntity.build(PutItemCommand).item(config).send()
    return config
  },

  async delete(clientId: string): Promise<void> {
    await ClientConfigEntity.build(DeleteItemCommand).key({ clientId }).send()
  },
}
