import { Entity, type FormattedItem, schema, Table } from 'dynamodb-toolbox'

import { DocumentClientSingleton } from './client'

export const clientConfigTable = new Table({
  name: process.env.CLIENT_CONFIG_TABLE_NAME ?? 'webhook-transformer-client-config',
  partitionKey: { name: 'clientId', type: 'string' },
  documentClient: DocumentClientSingleton.get(),
})

const fieldMappingSchema = schema.map({
  source: schema.string(),
  target: schema.string(),
  transform: schema.string().optional(),
})

export const ClientConfigEntity = new Entity({
  name: 'ClientConfig',
  table: clientConfigTable,
  timestamps: false,
  schema: schema.item({
    clientId: schema.string().key(),
    endpointType: schema.string().enum('shopify_graphql').required(),
    endpointUrl: schema.string().required(),
    authType: schema.string().enum('oauth', 'api_key').required(),
    fieldMappings: schema.list(fieldMappingSchema).required(),
    statusMap: schema.record(schema.string(), schema.string()).required(),
  }),
})

export type ClientConfig = FormattedItem<typeof ClientConfigEntity>
