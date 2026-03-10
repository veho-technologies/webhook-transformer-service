import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'

import { MyStack } from './stack'

test('Snapshot', () => {
  const app = new App()
  const stack = new MyStack(app, 'test', {
    appEnvironment: 'test',
    serviceName: 'test-service',
  })

  const template = Template.fromStack(stack)
  expect(template.toJSON()).toMatchSnapshot()
})
