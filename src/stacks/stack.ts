import { VehoStack, VehoStackProps } from '@veho/cdk'
import { Construct } from 'constructs'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MyStackProps extends VehoStackProps {
  // define additional props here...
}

export class MyStack extends VehoStack {
  constructor(scope: Construct, id: string, { ...props }: MyStackProps) {
    super(scope, id, props)

    // define resources here...
  }
}
