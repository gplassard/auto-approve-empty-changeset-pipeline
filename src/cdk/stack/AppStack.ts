import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface AppStackProps extends StackProps {
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // stack is empty
  }
}
