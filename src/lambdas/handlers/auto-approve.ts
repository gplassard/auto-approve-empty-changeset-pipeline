import { Logger } from '@aws-lambda-powertools/logger';
import { ChangeSetStatus, CloudFormation } from '@aws-sdk/client-cloudformation';
import { ApprovalStatus, CodePipeline } from '@aws-sdk/client-codepipeline';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Context } from 'aws-lambda';
// eslint-disable-next-line import/no-extraneous-dependencies
import { CodePipelineEvent } from 'aws-lambda/trigger/codepipeline';
import { AutoApproveOutcome, UserParameters } from '../../shared/model';

const codePipeline = new CodePipeline({});
const cloudFormation = new CloudFormation({});
const logger = new Logger({ serviceName: 'auto-approve' });

export const handler = async (event: CodePipelineEvent, context: Context) => {
  logger.addContext(context);

  const userParameters = JSON.parse(event['CodePipeline.job'].data.actionConfiguration.configuration.UserParameters) as UserParameters;
  logger.info('User parameters', { userParameters });

  try {
    const outcome = await processChangesetAutoApproval(userParameters, context);
    logger.info('Auto approve outcome', { outcome });

    const summary = `Auto approve outcome ${outcome}`;
    const jobSuccessResult = await codePipeline.putJobSuccessResult({
      jobId: event['CodePipeline.job'].id,
      executionDetails: {
        summary,
        percentComplete: outcome === AutoApproveOutcome.AUTO_APPROVED ? 100 : 50,
      },
      outputVariables: {
        summary,
        requestId: context.awsRequestId,
      },
    });
    logger.debug('Job success result response', { jobSuccessResult });
  } catch (error: unknown) {
    logger.error('Unexpected error, still reporting a success as we don\'t want to block the pipeline', { error });

    const summary = 'An error occurred while trying to process the auto approval';
    const jobSuccessResult = await codePipeline.putJobSuccessResult({
      jobId: event['CodePipeline.job'].id,
      executionDetails: {
        summary: summary,
        percentComplete: 0,
      },
      outputVariables: {
        summary,
        requestId: context.awsRequestId,
      },
    });
    logger.debug('Job success result response', { jobSuccessResult });
    throw error; // still throwing to get lambda metrics to show that we got an error
  }
};

async function processChangesetAutoApproval(userParameters: UserParameters, context: Context): Promise<AutoApproveOutcome> {
  const changeSet = await cloudFormation.describeChangeSet({
    ChangeSetName: userParameters.changeSetName,
    StackName: userParameters.stackName,
  });
  logger.debug('Changeset', { changeSet });

  if (changeSet.Status !== ChangeSetStatus.CREATE_COMPLETE && changeSet.Status !== ChangeSetStatus.FAILED) {
    throw new Error(`Expected changeset ${userParameters.changeSetName} for stack ${userParameters.stackName} to have status CREATE_COMPLETE or FAILED, got ${changeSet.Status}`);
  }

  if (changeSet.Changes?.length === 0) {
    logger.info('Changeset is empty, preparing auto approving manual approval');

    const pipelineState = await codePipeline.getPipelineState({
      name: userParameters.pipelineName,
    });
    logger.debug('Pipeline state', { pipelineState });

    const approvalActions = (pipelineState.stageStates ?? [])
      .filter(state =>
        state.stageName === userParameters.approvalStageName
          && state.latestExecution?.pipelineExecutionId === userParameters.pipelineExecutionId,
      )
      .flatMap(state => state.actionStates ?? [])
      .filter(action => action.actionName === userParameters.approvalActionName);

    logger.info('Found approval actions', { approvalActions });
    if (approvalActions.length !== 1) {
      throw new Error(`Could not find approval action corresponding to stage ${userParameters.approvalStageName}, action ${userParameters.approvalActionName} and execution ${userParameters.pipelineExecutionId}`);
    }

    const token = approvalActions[0].latestExecution?.token;
    const approvalResponse = await codePipeline.putApprovalResult({
      result: {
        status: ApprovalStatus.Approved,
        summary: `Changeset was empty, auto approve by lambda ${context.functionName} for pipeline execution ${userParameters.pipelineExecutionId} and awsRequestId ${context.awsRequestId}`,
      },
      pipelineName: userParameters.pipelineName,
      actionName: userParameters.approvalActionName,
      stageName: userParameters.approvalStageName,
      token: token,
    });
    logger.debug('Approval response', { approvalResponse });
    return AutoApproveOutcome.AUTO_APPROVED;
  }
  return AutoApproveOutcome.NOT_AUTO_APPROVED;
}
