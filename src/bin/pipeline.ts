import { App } from 'aws-cdk-lib';
import { PipelineStack } from '../cdk/stack/PipelineStack';

const app = new App();
new PipelineStack(app, 'pipeline', {
  stackName: 'pipeline-stack',
});

app.synth();
