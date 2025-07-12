/* eslint-disable import/no-extraneous-dependencies */
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it, expect } from 'vitest';
import { AppStack } from '../../../src/cdk/stack/AppStack';

describe('AppStack', () => {
  it('should produce the expected cloudformation', () => {
    const app = new App();
    const stack = new AppStack(app, 'AppStack', {});

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
