import type { ExecutionJournal } from './domain'
import type { GitHubAdapter } from './github'
import { decideResume, saveJournal, updateAction } from './journal'

/** Runs the durable action state machine with persistence around every mutation. */
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function executePlan(options: { journal: ExecutionJournal, adapter: GitHubAdapter, journalPath?: string, persist?: (journal: ExecutionJournal) => Promise<void> }): Promise<ExecutionJournal> {
  let journal = options.journal
  const persist = options.persist ?? (options.journalPath ? async (value: ExecutionJournal) => saveJournal(options.journalPath!, value) : async () => undefined)
  for (const action of journal.actions) {
    if (action.state === 'completed')
      continue
    if (action.dependsOn.some(dependency => journal.actions.find(candidate => candidate.key === dependency)?.state !== 'completed'))
      continue
    const decision = decideResume(action, { matches: await options.adapter.reconcile(action, action.reconciliationKey) })
    if (decision.kind === 'complete') {
      journal = updateAction(journal, action.key, 'completed', { resourceId: decision.resource?.id, resourceUrl: decision.resource?.url })
      await persist(journal)
      continue
    }
    if (decision.kind === 'ambiguous')
      throw new Error(`Ambiguous reconciliation for ${action.key}`)
    const resolvedData = { ...action.data }
    if (action.kind === 'relationship') {
      const story = journal.actions.find(candidate => candidate.key === `story-${action.key.replace('relationship-', '')}`)
      const epicId = action.dependsOn.find(key => key.startsWith('epic-'))
      const epic = epicId ? journal.actions.find(candidate => candidate.key === epicId) : undefined
      if (story?.resourceId && epic?.resourceId)
        Object.assign(resolvedData, { childId: story.resourceId, parentId: epic.resourceId })
    }
    if (action.kind === 'item') {
      const source = action.dependsOn.find(key => key !== 'project')
      const content = source ? journal.actions.find(candidate => candidate.key === source)?.resourceId : undefined
      if (content)
        Object.assign(resolvedData, { contentId: content })
    }
    const executableAction = Object.keys(resolvedData).length ? { ...action, data: resolvedData } : action
    journal = updateAction(journal, action.key, 'in-progress')
    await persist(journal)
    try {
      const resource = await options.adapter.execute(executableAction, action.reconciliationKey)
      if (!resource.id)
        throw new Error('GitHub adapter returned no resource ID')
      journal = updateAction(journal, action.key, 'completed', { resourceId: resource.id, resourceUrl: resource.url })
    }
    catch (error) {
      journal = updateAction(journal, action.key, 'failed', { error: error instanceof Error ? error.message : String(error) })
    }
    await persist(journal)
    if (journal.actions.find(candidate => candidate.key === action.key)?.state === 'failed')
      break
  }
  return journal
}
