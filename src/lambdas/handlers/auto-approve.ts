import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ChangeSetStatus, CloudFormation } from '@aws-sdk/client-cloudformation';
import { ApprovalStatus, CodePipeline } from '@aws-sdk/client-codepipeline';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Context } from 'aws-lambda';
// eslint-disable-next-line import/no-extraneous-dependencies
import { CodePipelineCloudWatchStageEvent } from 'aws-lambda/trigger/codepipeline-cloudwatch-stage';
import { AutoApprovalEnvironment, AutoApproveOutcome } from '../../shared/model';

const logger = new Logger({ serviceName: 'auto-approve' });
const tracer = new Tracer({ serviceName: 'auto-approve' });
const codePipeline = tracer.captureAWSv3Client(new CodePipeline({}));
const cloudFormation = tracer.captureAWSv3Client(new CloudFormation({}));

export interface AutoApprovalParameters {
  stackName: string;
  changeSetName: string;
  pipelineName: string;
  approvalStageName: string;
  approvalActionName: string;
  pipelineExecutionId: string;
}
const env: AutoApprovalEnvironment = process.env as any;

export const handler = async (event: CodePipelineCloudWatchStageEvent, context: Context) => {
  logger.addContext(context);
  logger.debug('event', { event });

  const params: AutoApprovalParameters = {
    approvalActionName: env.approvalActionName,
    approvalStageName: env.approvalStageName,
    changeSetName: env.changeSetName,
    pipelineName: env.pipelineName,
    stackName: env.stackName,
    pipelineExecutionId: event.detail['execution-id'],
  };
  const outcome = await processChangesetAutoApproval(params, context);
  logger.info('Auto approve outcome', { outcome });
};

async function processChangesetAutoApproval(params: AutoApprovalParameters, context: Context): Promise<AutoApproveOutcome> {
  const changeSet = await cloudFormation.describeChangeSet({
    ChangeSetName: params.changeSetName,
    StackName: params.stackName,
  });
  logger.debug('Changeset', { changeSet });

  if (changeSet.Status !== ChangeSetStatus.CREATE_COMPLETE && changeSet.Status !== ChangeSetStatus.FAILED) {
    throw new Error(`Expected changeset ${params.changeSetName} for stack ${params.stackName} to have status CREATE_COMPLETE or FAILED, got ${changeSet.Status}`);
  }

  if (changeSet.Changes?.length === 0) {
    logger.info('Changeset is empty, preparing auto approving manual approval');

    const pipelineState = await codePipeline.getPipelineState({
      name: params.pipelineName,
    });
    logger.debug('Pipeline state', { pipelineState });

    const approvalActions = (pipelineState.stageStates ?? [])
      .filter(state =>
        state.stageName === params.approvalStageName
          && state.latestExecution?.pipelineExecutionId === params.pipelineExecutionId,
      )
      .flatMap(state => state.actionStates ?? [])
      .filter(action => action.actionName === params.approvalActionName);

    logger.info('Found approval actions', { approvalActions });
    if (approvalActions.length !== 1) {
      throw new Error(`Could not find approval action corresponding to stage ${params.approvalStageName}, action ${params.approvalActionName} and execution ${params.pipelineExecutionId}`);
    }

    const token = approvalActions[0].latestExecution?.token;
    const approvalResponse = await codePipeline.putApprovalResult({
      result: {
        status: ApprovalStatus.Approved,
        summary: `Changeset was empty, auto approve by lambda ${context.functionName} for pipeline execution ${params.pipelineExecutionId} and awsRequestId ${context.awsRequestId}`,
      },
      pipelineName: params.pipelineName,
      actionName: params.approvalActionName,
      stageName: params.approvalStageName,
      token: token,
    });
    logger.debug('Approval response', { approvalResponse });
    return AutoApproveOutcome.AUTO_APPROVED;
  }
  return AutoApproveOutcome.NOT_AUTO_APPROVED;
}
