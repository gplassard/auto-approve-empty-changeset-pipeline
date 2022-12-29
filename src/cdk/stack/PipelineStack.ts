import { Arn, CfnParameter, RemovalPolicy, ScopedAws, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import { BuildEnvironmentVariableType, BuildSpec, LinuxBuildImage, Project } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import {
  CloudFormationExecuteChangeSetAction,
  CodeBuildAction,
  GitHubSourceAction,
  ManualApprovalAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AutoApprovalEnvironment } from '../../shared/model';

interface PipelineStackProps extends StackProps {
  stackName: string;
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    const { accountId, region } = new ScopedAws(this);

    const appStackName = 'app-stack';
    const appStackArn = Arn.format({ service: 'cloudformation', resource: 'stack', resourceName: appStackName }, this);
    const changeSetName = 'codepipeline';
    const pipelineName = `${props.stackName}-pipeline`;
    const changeSetStage = 'changeSetStage';
    const approvalActionName = 'goReviewTheChangeset';

    const artifactBucket = new Bucket(this, 'bucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const sourceArtifact = new Artifact();

    const source = new GitHubSourceAction({
      variablesNamespace: 'GITHUB',
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
      runOrder: 1,
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

    const env: AutoApprovalEnvironment = {
      stackName: appStackName,
      pipelineName: pipelineName,
      changeSetName: changeSetName,
      approvalStageName: changeSetStage,
      approvalActionName: approvalActionName,
    };
    const autoApproveLambda = new NodejsFunction(this, 'autoapprove', {
      architecture: Architecture.ARM_64,
      entry: 'src/lambdas/handlers/auto-approve.ts',
      runtime: Runtime.NODEJS_18_X,
      tracing: Tracing.ACTIVE,
      environment: {
        LOG_LEVEL: 'DEBUG',
        ...env,
      },
    });


    // FIXME url seem not to work properly
    const manualApproval = new ManualApprovalAction({
      runOrder: 2,
      actionName: 'goReviewTheChangeset',
      additionalInformation: 'You should review the changeset from this commit #{GITHUB.CommitUrl}',
      externalEntityLink: `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/changesets?stackId=${encodeURIComponent(appStackName)}`,
    });

    const deployCloudformation = new CloudFormationExecuteChangeSetAction({
      actionName: 'deployCloudformation',
      changeSetName: 'codepipeline',
      stackName: appStackName,
    });

    const pipeline = new Pipeline(this, 'pipeline', {
      pipelineName,
      artifactBucket,
      stages: [
        { stageName: 'github', actions: [source] },
        { stageName: changeSetStage, actions: [codebuild, manualApproval] },
        { stageName: 'deployCloudformation', actions: [deployCloudformation] },
      ],
    });

    pipeline.onEvent('manualApprovalTrigger', {
      target: new LambdaFunction(autoApproveLambda),
      eventPattern: {
        detail: {
          action: [approvalActionName],
          stage: [changeSetStage],
          state: ['STARTED'],
        },
      },
    });
    autoApproveLambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['cloudformation:DescribeChangeSet'],
      resources: [`${appStackArn}/*`],
    }));
    autoApproveLambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['codepipeline:GetPipelineState'],
      resources: [pipeline.pipelineArn],
    }));
    manualApproval.grantManualApproval(autoApproveLambda);
  }
}
