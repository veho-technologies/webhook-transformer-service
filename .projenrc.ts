import { GaiaCdkApp } from '@veho/gaia-projen'
const project = new GaiaCdkApp({
  ciSlackChannel: '_circleci',
  defaultReleaseBranch: 'main',
  defaultToPNPM: true,
  devDeps: ['@veho/gaia-projen'],
  enableCIWorkflowSynthesis: true,
  enableLambdaLiveDebugger: true,
  enablePersonalStacks: true,
  name: 'webhook-transformer-service',
  projenrcTs: true,

  // deps: [],                                                                                                                                                                                                                                                                                      /* Runtime dependencies of this module. */
  // description: undefined,                                                                                                                                                                                                                                                                        /* The description is just a string that helps people understand the purpose of the package. */
  // environments: [{ name: 'dev', branch: 'dev', usedForDevelopment: true, awsAccountId: '657230704726' }, { name: 'staging', awsAccountId: '048595045497' }, { name: 'prod',  dependsOn: ['staging'], requireManualDeployApproval: true, enableCiDiffJob: true, awsAccountId: '595208618232' }],  /* Options to define application environments. */
  // packageName: undefined,                                                                                                                                                                                                                                                                        /* The "name" in package.json. */
})
project.synth()
