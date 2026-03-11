import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'

import { WebhookTransformerStack } from './stack'

test('Snapshot', () => {
  const app = new App()
  const stack = new WebhookTransformerStack(app, 'test', {
    appEnvironment: 'test',
    serviceName: 'test-service',
    teamName: 'growth',
    isEphemeral: false,
  })

  const template = Template.fromStack(stack)
  expect(template.toJSON()).toMatchSnapshot()
})
