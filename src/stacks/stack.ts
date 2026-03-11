import { TableV2, VehoStack, VehoStackProps } from '@veho/cdk'
import { RemovalPolicy } from 'aws-cdk-lib'
import { Construct } from 'constructs'

import { schema } from '../database/dynamo'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WebhookTransformerStackProps extends VehoStackProps {
  // define additional props here...
}

export class WebhookTransformerStack extends VehoStack {
  public readonly table: TableV2

  constructor(scope: Construct, id: string, { ...props }: WebhookTransformerStackProps) {
    super(scope, id, props)

    this.table = TableV2.fromOneTableSchema(this, 'Table', schema, {
      timeToLiveAttribute: 'timeToLive',
      removalPolicy: RemovalPolicy.RETAIN,
    })
  }
}
