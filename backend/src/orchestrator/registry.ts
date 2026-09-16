import { Step, PipelineType } from './types.js';
import { TICKET_TRIAGE_STEPS } from '../pipelines/ticket-triage.pipeline.js';
import { INCIDENT_RESPONSE_STEPS } from '../pipelines/incident-response.pipeline.js';
import { KB_SELF_LEARNING_STEPS } from '../pipelines/kb-self-learning.pipeline.js';
import { CI_TRIAGE_STEPS } from '../pipelines/ci-triage.pipeline.js';
import { BUILD_DEPLOY_STEPS } from '../pipelines/build-deploy.pipeline.js';
import { MERGEGATE_STEPS } from '../pipelines/mergegate.pipeline.js';

export function getPipelineSteps(type: PipelineType): Step[] {
  switch (type) {
    case 'TICKET_TRIAGE':
      return TICKET_TRIAGE_STEPS;
    case 'INCIDENT_RESPONSE':
      return INCIDENT_RESPONSE_STEPS;
    case 'KB_SELF_LEARNING':
      return KB_SELF_LEARNING_STEPS;
    case 'CI_TRIAGE':
      return CI_TRIAGE_STEPS;
    case 'BUILD_DEPLOY':
      return BUILD_DEPLOY_STEPS;
    case 'MERGEGATE':
      return MERGEGATE_STEPS;
    default:
      throw new Error(`Unknown pipeline type: ${type}`);
  }
}
