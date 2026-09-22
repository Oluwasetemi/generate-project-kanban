import type { ExecutionSummary, WizardState } from './wizard'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { BunGitHubAdapter } from './github'
import { journalFromPlan, loadJournal, saveJournal } from './journal'
import { planCreation } from './planner'
import { validatePreflight } from './preflight'
import { executePlan } from './runner'
import { BUILT_IN_TEMPLATES } from './templates'
import { PreviewWizard } from './wizard'

async function executeFromWizard(state: WizardState): Promise<ExecutionSummary> {
  const template = BUILT_IN_TEMPLATES[state.templateIndex]
  if (!template)
    throw new Error('selected project template is unavailable')
  const answers = { ...state.answers, owner: state.answers.owner, repository: state.answers.repository }
  const plan = planCreation(template, answers)
  const journalPath = join(homedir(), '.local', 'state', 'generate-project-kanban', `${plan.fingerprint}.json`)
  let journal
  let resumed = false
  try {
    const existing = await loadJournal(journalPath)
    resumed = existing.planFingerprint === plan.fingerprint
    journal = resumed ? existing : journalFromPlan(plan)
  }
  catch {
    journal = journalFromPlan(plan)
  }
  const projectId = journal.actions.find(action => action.key === 'project')?.resourceId
  const adapter = new BunGitHubAdapter({ token: state.token, owner: answers.owner, repository: answers.repository, repositoryMode: answers.repositoryMode, projectId })
  const report = await adapter.preflight()
  const errors = validatePreflight(report, plan)
  if (errors.length)
    throw new Error(errors.join('; '))
  await saveJournal(journalPath, journal)
  const result = await executePlan({ journal, adapter, journalPath })
  const failed = result.actions.find(action => action.state === 'failed')
  if (failed)
    throw new Error(`${failed.title}: ${failed.error ?? 'action failed'}. Resume using the same plan.`)
  return {
    repositoryUrl: result.actions.find(action => action.key === 'repository')?.resourceUrl,
    projectUrl: result.actions.find(action => action.key === 'project')?.resourceUrl,
    completedActions: result.actions.filter(action => action.state === 'completed').length,
    journalPath,
    resumed,
  }
}

function App() {
  return (
    <box alignItems="center" justifyContent="center" flexGrow={1} padding={1}>
      <PreviewWizard onExecute={executeFromWizard} />
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<App />)
