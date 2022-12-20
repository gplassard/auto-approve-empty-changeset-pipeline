import { App } from 'aws-cdk-lib';
import { PipelineStack } from '../src/cdk/stack/PipelineStack';

const app = new App();
new PipelineStack(app, 'pipeline', {

});

app.synth();
