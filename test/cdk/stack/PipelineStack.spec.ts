/* eslint-disable import/no-extraneous-dependencies */
import { describe, it, expect } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AppStack } from '../../../src/cdk/stack/AppStack';
import { PipelineStack } from '../../../src/cdk/stack/PipelineStack';

describe('PipelineStack', () => {
  it('should produce the expected cloudformation', () => {
    const app = new App();
    const stack = new PipelineStack(app, 'PipelineStack', { stackName: 'applicative-stack' });

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
