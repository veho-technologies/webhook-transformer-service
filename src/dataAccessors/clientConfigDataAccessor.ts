import { ClientConfigEntity, ClientConfigModel } from '../database/dynamo'

export const clientConfigDataAccessor = {
  async getByClientId(clientId: string): Promise<ClientConfigEntity | undefined> {
    return ClientConfigModel.get({ clientId })
  },

  async upsert(config: ClientConfigEntity): Promise<ClientConfigEntity> {
    return ClientConfigModel.upsert(config)
  },

  async delete(clientId: string): Promise<void> {
    await ClientConfigModel.remove({ clientId })
  },
}
