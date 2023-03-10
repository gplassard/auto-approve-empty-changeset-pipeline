export interface UserParameters {
  stackName: string;
  changeSetName: string;
  pipelineName: string;
  approvalStageName: string;
  approvalActionName: string;
  pipelineExecutionId: string;
}

export enum AutoApproveOutcome {
  AUTO_APPROVED = 'AUTO_APPROVED',
  NOT_AUTO_APPROVED = 'NOT_AUTO_APPROVED',
}
