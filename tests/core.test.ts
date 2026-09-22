import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { BunGitHubAdapter } from '../src/github'
import { decideResume, journalFromPlan, loadJournal, saveJournal, updateAction } from '../src/journal'
import { planCreation } from '../src/planner'
import { executePlan } from '../src/runner'
import { BUILT_IN_TEMPLATES } from '../src/templates'
import { validateTemplate } from '../src/validation'
import { advanceWizard, extractGithubToken, isGithubToken, isQuitKey } from '../src/wizard'

const answers = { owner: 'acme', repository: 'kanban', repositoryMode: 'create' as const, privateRepository: true }

describe('wizard controls', () => {
  test('recognises Ctrl+C and Ctrl+Q as quit shortcuts', () => {
    expect(isQuitKey({ name: 'c', ctrl: true })).toBe(true)
    expect(isQuitKey({ name: 'q', ctrl: true })).toBe(true)
    expect(isQuitKey({ name: 'q' })).toBe(false)
    expect(isQuitKey({ name: 'c' })).toBe(false)
  })
})

describe('templates and validation', () => {
  test('all five built-ins satisfy the canonical contract', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(5)
    for (const template of BUILT_IN_TEMPLATES) expect(validateTemplate(template)).toEqual({ valid: true })
    const fingerprints = BUILT_IN_TEMPLATES.map(template => planCreation(template, answers).fingerprint)
    expect(new Set(fingerprints).size).toBe(5)
    for (const template of BUILT_IN_TEMPLATES) {
      expect(template.epics.length).toBe(4)
      expect(template.stories.length).toBeGreaterThanOrEqual(36)
      expect(template.stories.length).toBeLessThanOrEqual(40)
      expect(template.stories.every(story => story.acceptanceCriteria.length >= 3)).toBe(true)
      expect(new Set(template.stories.map(story => story.id)).size).toBe(template.stories.length)
      expect(new Set(template.stories.map(story => story.week))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
      expect(new Set(template.stories.map(story => story.epicId)).size).toBeGreaterThan(1)
      expect(template.stories.every(story => story.role && story.action && story.benefit && story.category)).toBe(true)
      expect(template.epics.every(epic => epic.description && epic.role && epic.action && epic.benefit)).toBe(true)
    }
  })

  test('rejects incorrect grade weights and unknown epic references', () => {
    const template = structuredClone(BUILT_IN_TEMPLATES[0]!)
    template.grade.weeklyTotal = 49
    template.stories[0]!.epicId = 'missing'
    const result = validateTemplate(template)
    expect(result.valid).toBe(false)
    if (!result.valid)
      expect(result.errors.join(' ')).toContain('unknown epic')
  })

  test('extracts supported GitHub tokens from clipboard text', () => {
    const token = `ghp_${'a'.repeat(36)}`
    expect(extractGithubToken(`token: ${token}\n`)).toBe(token)
    expect(isGithubToken(token)).toBe(true)
    expect(extractGithubToken('not a token')).toBeUndefined()
  })

  test('Enter advances every wizard phase', () => {
    const base = { token: `ghp_${'a'.repeat(36)}`, answers: { owner: 'acme', repository: 'kanban', repositoryMode: 'existing' as const, privateRepository: true }, templateIndex: 0, repositoryField: 'owner' as const }
    expect(advanceWizard({ ...base, phase: 'token' }).phase).toBe('repository')
    expect(advanceWizard({ ...base, phase: 'repository' }).phase).toBe('template')
    expect(advanceWizard({ ...base, phase: 'template' }).phase).toBe('preview')
    expect(advanceWizard({ ...base, phase: 'preview' }).phase).toBe('confirmed')
    expect(advanceWizard({ ...base, phase: 'confirmed' }).phase).toBe('confirmed')
  })
})

describe('creation planning', () => {
  test('is deterministic and orders dependencies before items', () => {
    const first = planCreation(BUILT_IN_TEMPLATES[0]!, answers)
    const second = planCreation(BUILT_IN_TEMPLATES[0]!, answers)
    expect(first).toEqual(second)
    expect(first.actions[0]!.key).toBe('repository')
    expect(first.actions.findIndex(a => a.key === 'project')).toBeLessThan(first.actions.findIndex(a => a.kind === 'item'))
    expect(first.actions.every(action => action.marker.includes('ecommerce-admin') || action.kind === 'repository')).toBe(true)
    expect(first.actions.filter(action => action.kind === 'label').every(action => String(action.data?.name).length <= 50)).toBe(true)
  })
})

describe('journal persistence and resume', () => {
  test('persists no token and round trips actions', async () => {
    const plan = planCreation(BUILT_IN_TEMPLATES[0]!, answers)
    const journal = journalFromPlan(plan)
    const directory = await mkdtemp(join(tmpdir(), 'kanban-journal-'))
    const path = join(directory, 'run.json')
    await saveJournal(path, journal)
    const content = await readFile(path, 'utf8')
    expect(content).not.toContain('secret-token')
    expect(content).not.toContain('GITHUB_TOKEN')
    expect(await loadJournal(path)).toMatchObject({ planFingerprint: plan.fingerprint, actions: journal.actions })
  })

  test('reconciles one match, reruns no match, and stops on ambiguity', () => {
    const action = journalFromPlan(planCreation(BUILT_IN_TEMPLATES[0]!, answers)).actions[0]!
    expect(decideResume({ ...action, state: 'completed' }).kind).toBe('skip')
    expect(decideResume({ ...action, state: 'in-progress' }, { matches: [{ id: 'repo-1' }] }).kind).toBe('complete')
    expect(decideResume({ ...action, state: 'in-progress' }, { matches: [] }).kind).toBe('run')
    expect(decideResume({ ...action, state: 'in-progress' }, { matches: [{ id: 'a' }, { id: 'b' }] }).kind).toBe('ambiguous')
    expect(updateAction(journalFromPlan(planCreation(BUILT_IN_TEMPLATES[0]!, answers)), action.key, 'in-progress').actions[0]!.state).toBe('in-progress')
  })
})

describe('execution and adapter boundaries', () => {
  test('marks actions in progress and persists after every result', async () => {
    const journal = journalFromPlan(planCreation(BUILT_IN_TEMPLATES[0]!, { ...answers, repositoryMode: 'existing' }))
    const states: string[] = []
    const adapter = { reconcile: async () => [], execute: async (action: { key: string }) => ({ id: action.key }) }
    const result = await executePlan({ journal, adapter, persist: async (value) => { states.push(value.actions[0]!.state) } })
    expect(result.actions.every(action => action.state === 'completed')).toBe(true)
    expect(states[0]).toBe('in-progress')
    expect(states.at(-1)).toBe('completed')
  })

  test('uses reconciliation and refuses ambiguous recovery', async () => {
    const journal = journalFromPlan(planCreation(BUILT_IN_TEMPLATES[0]!, answers))
    const uncertain = { ...journal, actions: journal.actions.map((action, index) => index === 0 ? { ...action, state: 'in-progress' as const } : action) }
    const calls: string[] = []
    const adapter = { reconcile: async () => [{ id: 'existing' }], execute: async (action: { key: string }) => { calls.push(action.key); return { id: 'new' } } }
    const result = await executePlan({ journal: uncertain, adapter, persist: async () => undefined })
    expect(result.actions[0]!.resourceId).toBe('existing')
    expect(calls).not.toContain('repository')
    const ambiguous = { ...journal, actions: journal.actions.map((action, index) => index === 0 ? { ...action, state: 'in-progress' as const } : action) }
    await expect(executePlan({ journal: ambiguous, adapter: { reconcile: async () => [{ id: 'a' }, { id: 'b' }], execute: async () => ({ id: 'never' }) }, persist: async () => undefined })).rejects.toThrow('Ambiguous')
  })

  test('adapter sends runtime token only in authorization header', async () => {
    const requests: Request[] = []
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init))
      return new Response(JSON.stringify({ data: { viewer: { login: 'acme', id: 'u1' }, user: { id: 'u1' }, organization: null, repository: { id: 'r1' }, rateLimit: { remaining: 100, resetAt: 'later' } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const adapter = new BunGitHubAdapter({ token: 'secret-token', owner: 'acme', repository: 'kanban', fetch: fetcher as typeof fetch })
    await adapter.preflight()
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer secret-token')
    expect(await requests[0]!.text()).not.toContain('secret-token')
  })

  test('adapter sends schema-compatible Project v2 field options', async () => {
    const requests: { query: string, variables: Record<string, unknown> }[] = []
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('api.github.com/repos/') && init?.method !== 'POST')
        return new Response(JSON.stringify({ id: 'repo-1' }), { status: 200 })
      const body = JSON.parse(String(init?.body)) as { query: string, variables: Record<string, unknown> }
      requests.push(body)
      const response = body.query.includes('createProjectV2Field')
        ? { data: { createProjectV2Field: { projectV2Field: { id: 'field-1' } } } }
        : { data: { node: { fields: { nodes: [{ id: 'field-1', name: 'Week', options: [{ id: 'option-1', name: 'Week 1' }] }] } } } }
      return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const adapter = new BunGitHubAdapter({ token: 'secret-token', owner: 'acme', repository: 'kanban', projectId: 'project-1', fetch: fetcher as typeof fetch })
    await adapter.execute({ key: 'field-week', kind: 'field', title: 'Create Week field', marker: 'field:week', dependsOn: ['project'], data: { name: 'Week', options: ['Week 1'] } }, 'field:week')
    expect(requests[0]!.variables.options).toEqual([{ name: 'Week 1', color: 'BLUE', description: 'Week 1' }])
  })

  test('adapter uses the REST owner node ID for Project v2 creation', async () => {
    const requests: { query: string, variables: Record<string, unknown> }[] = []
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('api.github.com/repos/'))
        return new Response(JSON.stringify({ id: 101, owner: { node_id: 'NODE_OWNER', type: 'User' } }), { status: 200 })
      const body = JSON.parse(String(init?.body)) as { query: string, variables: Record<string, unknown> }
      requests.push(body)
      const response = body.query.includes('createProjectV2')
        ? { data: { createProjectV2: { projectV2: { id: 'project-1', url: 'https://github.com/users/acme/projects/1' } } } }
        : { data: { updateProjectV2: { projectV2: { id: 'project-1' } } } }
      return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const adapter = new BunGitHubAdapter({ token: 'secret-token', owner: 'acme', repository: 'kanban', fetch: fetcher as typeof fetch })
    await adapter.execute({ key: 'project', kind: 'project', title: 'Create Project', marker: 'project:test', dependsOn: [], data: { title: 'Project' } }, 'project:test')
    expect(requests[0]!.variables.owner).toBe('NODE_OWNER')
  })
})
