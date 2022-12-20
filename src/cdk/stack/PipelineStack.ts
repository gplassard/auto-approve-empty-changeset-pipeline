import { Arn, CfnParameter, RemovalPolicy, ScopedAws, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import { BuildEnvironmentVariableType, BuildSpec, LinuxBuildImage, Project } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import {
  CloudFormationExecuteChangeSetAction,
  CodeBuildAction,
  GitHubSourceAction,
  LambdaInvokeAction,
  ManualApprovalAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface PipelineStackProps extends StackProps {
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    const { accountId, region, partition } = new ScopedAws(this);

    const appStackName = 'app-stack';
    const appStackArn = Arn.format({
      region,
      account: accountId,
      partition: partition,
      service: 'cloudformation',
      resource: `stack/${appStackName}`,
    });
    const changeSetName = 'codepipeline';

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
      oauthToken: SecretValue.cfnParameter(new CfnParameter(this, 'secret', {
        noEcho: true,
        type: 'AWS::SSM::Parameter::Value<String>',
        default: 'github-gplassard-webhook-token',
      })),
    });


    const cdkDeployRole = Role.fromRoleName(this, 'cdkDeployRole', `cdk-hnb659fds-deploy-role-${accountId}-${region}`);
    const cdkFilePublishRole = Role.fromRoleName(this, 'cdkFilePublishRole', `cdk-hnb659fds-file-publishing-role-${accountId}-${region}`);

    const codebuildRole = new Role(this, 'codebuildRole', { assumedBy: new ServicePrincipal('codebuild.amazonaws.com') });
    cdkDeployRole.grantAssumeRole(codebuildRole);
    cdkFilePublishRole.grantAssumeRole(codebuildRole);

    const codebuild = new CodeBuildAction({
      actionName: 'cdk',
      input: sourceArtifact,
      environmentVariables: {
        GITHUB_TOKEN: { type: BuildEnvironmentVariableType.PARAMETER_STORE, value: 'github-gplassard-read-packages-token' },
      },
      project: new Project(this, 'codebuild', {
        role: codebuildRole,
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
                `yarn cdk deploy --app 'ts-node bin/app.ts' --no-execute --change-set-name ${changeSetName}`,
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

    const manualApproval = new ManualApprovalAction({
      actionName: 'goReviewTheChangeset',
      additionalInformation: 'You should review the changeset',
      externalEntityLink: `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/changesets?stackId=${encodeURIComponent(appStackArn)}`,
    });
    const autoApproveEmptyChangeset = new LambdaInvokeAction({
      actionName: 'autoApproveEmptyChangeset',
      lambda: autoApproveLambda,
      userParameters: {
        stackName: appStackName,
        changesetName: changeSetName,
      },
    });

    const deployCloudformation = new CloudFormationExecuteChangeSetAction({
      actionName: 'deployCloudformation',
      changeSetName: 'codepipeline',
      stackName: appStackName,
    });

    new Pipeline(this, 'pipeline', {
      artifactBucket,
      stages: [
        { stageName: 'github', actions: [source] },
        { stageName: 'codebuild', actions: [codebuild] },
        { stageName: 'reviewChangeset', actions: [manualApproval, autoApproveEmptyChangeset] },
        { stageName: 'deployCloudformation', actions: [deployCloudformation] },
      ],
    });
  }
}
