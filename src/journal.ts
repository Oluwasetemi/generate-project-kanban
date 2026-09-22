import type { CreationPlan, ExecutionJournal, JournalAction, JournalActionState } from './domain'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function journalFromPlan(plan: CreationPlan): ExecutionJournal {
  return { schemaVersion: 1, planFingerprint: plan.fingerprint, templateId: plan.templateId, answers: plan.answers, actions: plan.actions.map(action => ({ ...action, state: 'pending', reconciliationKey: `${plan.fingerprint}:${action.key}` })), updatedAt: new Date().toISOString() }
}

export async function saveJournal(path: string, journal: ExecutionJournal): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify({ ...journal, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

export async function loadJournal(path: string): Promise<ExecutionJournal> { return JSON.parse(await readFile(path, 'utf8')) as ExecutionJournal }

export function updateAction(journal: ExecutionJournal, key: string, state: JournalActionState, details: Partial<JournalAction> = {}): ExecutionJournal {
  return { ...journal, actions: journal.actions.map(action => action.key === key ? { ...action, ...details, state } : action), nextPendingAction: journal.actions.find(action => action.key !== key && (action.state === 'pending' || action.state === 'failed'))?.key, updatedAt: new Date().toISOString() }
}

export interface Reconciliation { matches: { id: string, url?: string }[] }
export interface ResumeDecision { kind: 'skip' | 'run' | 'complete' | 'ambiguous', action: JournalAction, resource?: { id: string, url?: string } }
export function decideResume(action: JournalAction, reconciliation?: Reconciliation): ResumeDecision {
  if (action.state === 'completed')
    return { kind: 'skip', action }
  const matches = reconciliation?.matches ?? []
  if (matches.length === 1)
    return { kind: 'complete', action, resource: matches[0] }
  if (matches.length > 1)
    return { kind: 'ambiguous', action }
  return { kind: 'run', action }
}
