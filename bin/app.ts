import { App } from 'aws-cdk-lib';
import { AppStack } from '../src/cdk/stack/AppStack';

const app = new App();
new AppStack(app, 'app', {
  stackName: 'app-stack',
});

app.synth();
