import type { CreationPlan } from './domain'
import type { PreflightReport } from './github'

export interface PreflightClient { preflight: () => Promise<PreflightReport> }
export function validatePreflight(report: PreflightReport, plan: CreationPlan): string[] {
  const errors: string[] = []
  if (!report.login)
    errors.push('token did not resolve to an authenticated user')
  if (plan.answers.repositoryMode === 'existing' && !report.canReadRepository)
    errors.push('selected repository cannot be read')
  if (plan.answers.repositoryMode === 'existing' && !report.canWriteRepository)
    errors.push('selected repository cannot be written')
  if (plan.answers.repositoryMode === 'create' && report.canCreateRepository === false)
    errors.push('owner cannot create repositories')
  if (!report.canUseProjects)
    errors.push('GitHub Projects permission is unavailable')
  if (report.rateLimitRemaining < plan.actions.length)
    errors.push('GitHub rate limit does not leave enough capacity')
  return errors
}
