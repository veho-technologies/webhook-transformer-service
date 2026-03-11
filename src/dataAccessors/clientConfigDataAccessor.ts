import { ClientConfigEntity, ClientConfigModel } from '../database/dynamo'

export type ClientConfig = ClientConfigEntity

export const clientConfigDataAccessor = {
  async getByClientId(clientId: string): Promise<ClientConfig | undefined> {
    return ClientConfigModel.get({ clientId })
  },

  async upsert(config: ClientConfig): Promise<ClientConfig> {
    return ClientConfigModel.upsert(config)
  },

  async delete(clientId: string): Promise<void> {
    await ClientConfigModel.remove({ clientId })
  },
}
