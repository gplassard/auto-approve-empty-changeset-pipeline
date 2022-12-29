export interface AutoApprovalEnvironment {
  stackName: string;
  changeSetName: string;
  pipelineName: string;
  approvalStageName: string;
  approvalActionName: string;
}

export enum AutoApproveOutcome {
  AUTO_APPROVED = 'AUTO_APPROVED',
  NOT_AUTO_APPROVED = 'NOT_AUTO_APPROVED',
}
