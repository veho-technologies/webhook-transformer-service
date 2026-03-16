import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'
import type { ClientConfig } from '../database'

export const clientConfigManager = {
  async getConfig(clientId: string): Promise<ClientConfig | undefined> {
    return clientConfigDataAccessor.getByClientId(clientId)
  },

  async upsertConfig(config: ClientConfig): Promise<ClientConfig> {
    return clientConfigDataAccessor.create(config)
  },
}
