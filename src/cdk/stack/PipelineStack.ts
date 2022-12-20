import { CfnParameter, RemovalPolicy, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import { BuildEnvironmentVariableType, BuildSpec, LinuxBuildImage, Project } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import {
  CloudFormationExecuteChangeSetAction,
  CodeBuildAction,
  GitHubSourceAction,
  GitHubTrigger,
  LambdaInvokeAction,
  ManualApprovalAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface PipelineStackProps extends StackProps {
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const artifactBucket = new Bucket(this, 'bucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const sourceArtifact = new Artifact();

    const source = new GitHubSourceAction({
      actionName: 'github',
      repo: 'auto-approve-empty-changeset-pipeline',
      owner: 'gplassard',
      output: sourceArtifact,
      branch: 'main',
      trigger: GitHubTrigger.POLL,
      oauthToken: SecretValue.cfnParameter(new CfnParameter(this, 'secret', {
        noEcho: true,
        type: 'AWS::SSM::Parameter::Value<String>',
        default: 'github-gplassard-webhook-token',
      })),
    });

    const codebuild = new CodeBuildAction({
      actionName: 'cdk',
      input: sourceArtifact,
      environmentVariables: {
        GITHUB_TOKEN: { type: BuildEnvironmentVariableType.PARAMETER_STORE, value: 'github-gplassard-read-packages-token' },
      },
      project: new Project(this, 'codebuild', {
        environment: {
          buildImage: LinuxBuildImage.AMAZON_LINUX_2_4,
        },
        buildSpec: BuildSpec.fromObjectToYaml({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': {
                nodejs: '16.x',
              },
              'commands': [
                'echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> .npmrc',
                'yarn install',
              ],
            },
            build: {
              commands: [
                'yarn cdk deploy --app \'ts-node bin/app.ts\' --no-execute --change-set-name codepipeline',
              ],
            },
          },
        }),
      }),
    });

    const autoApproveLambda = new NodejsFunction(this, 'autoapprove', {
      architecture: Architecture.ARM_64,
      entry: 'src/lambdas/handlers/auto-approve.ts',
      runtime: Runtime.NODEJS_18_X,
    });

    const manualApproval = new ManualApprovalAction({ actionName: 'manualApproval' });
    const autoApproveEmptyChangeset = new LambdaInvokeAction({
      actionName: 'autoApproveEmptyChangeset',
      lambda: autoApproveLambda,
    });

    const deployCloudformation = new CloudFormationExecuteChangeSetAction({
      actionName: 'deployCloudformation',
      changeSetName: 'codepipeline',
      stackName: 'app-stack',
    });

    new Pipeline(this, 'pipeline', {
      artifactBucket,
      stages: [
        { stageName: 'github', actions: [source] },
        { stageName: 'codebuild', actions: [codebuild] },
        { stageName: 'manualApproval', actions: [manualApproval, autoApproveEmptyChangeset] },
        { stageName: 'deployCloudformation', actions: [deployCloudformation] },
      ],
    });
  }
}
