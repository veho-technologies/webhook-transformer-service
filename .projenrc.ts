import { GaiaCdkApp } from '@veho/gaia-projen'
const project = new GaiaCdkApp({
  ciSlackChannel: '_circleci',
  defaultReleaseBranch: 'main',
  defaultToPNPM: true,
  devDeps: ['@veho/gaia-projen'],
  enableCIWorkflowSynthesis: true,
  enableLambdaLiveDebugger: true,
  enablePersonalStacks: true,
  minNodeVersion: '22.0.0',
  workflowNodeVersion: '22.14',
  name: 'webhook-transformer-service',
  projenrcTs: true,
  jestOptions: {
    jestConfig: {
      setupFiles: ['<rootDir>/src/test/setupEnv.ts'],
    },
  },

  deps: [
    'dynamodb-toolbox',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb',
    'aws-xray-sdk-core',
    'ulid',
    'graphql-request',
    'graphql',
    'aws-sigv4-fetch',
    '@veho/merged-api',
    '@veho/event-types',
  ],
  // description: undefined,                                                                                                                                                                                                                                                                        /* The description is just a string that helps people understand the purpose of the package. */
  // environments: [{ name: 'dev', branch: 'dev', usedForDevelopment: true, awsAccountId: '657230704726' }, { name: 'staging', awsAccountId: '048595045497' }, { name: 'prod',  dependsOn: ['staging'], requireManualDeployApproval: true, enableCiDiffJob: true, awsAccountId: '595208618232' }],  /* Options to define application environments. */
  // packageName: undefined,                                                                                                                                                                                                                                                                        /* The "name" in package.json. */
})
project.synth()
