import type { CreationAnswers } from './domain'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHostClipboard, decodePasteBytes } from '@opentui/core'
import { useKeyboard, usePaste, useRenderer } from '@opentui/react'
import { useRef, useState } from 'react'
import { planCreation } from './planner'
import { BUILT_IN_TEMPLATES } from './templates'

export type WizardPhase = 'token' | 'repository' | 'template' | 'preview' | 'confirmed'
export interface ExecutionSummary { repositoryUrl?: string, projectUrl?: string, completedActions: number, journalPath: string, resumed: boolean }
export interface WizardState { phase: WizardPhase, token: string, answers: CreationAnswers, templateIndex: number, repositoryField: 'owner' | 'repository' | 'mode', error?: string, executionComplete?: boolean, executionSummary?: ExecutionSummary }
export type WizardExecution = (state: WizardState) => Promise<ExecutionSummary>
const WIZARD_STEPS: Array<{ phase: WizardPhase, label: string }> = [
  { phase: 'token', label: 'Access' },
  { phase: 'repository', label: 'Repository' },
  { phase: 'template', label: 'Template' },
  { phase: 'preview', label: 'Review' },
]
export const maskedToken = (token: string) => '*'.repeat(token.length)
export const GITHUB_TOKEN_PATTERN = /\b(?:github_pat_\w{20,}|gh[pousr]_\w{20,})\b/
export function extractGithubToken(value: string): string | undefined {
  return value.match(GITHUB_TOKEN_PATTERN)?.[0]
}
export function isGithubToken(value: string): boolean { return GITHUB_TOKEN_PATTERN.test(value) }
export function isQuitKey(key: { name: string, ctrl?: boolean }): boolean {
  return key.ctrl === true && (key.name === 'c' || key.name === 'q')
}
export function advanceWizard(state: WizardState): WizardState {
  if (state.phase === 'token')
    return isGithubToken(state.token) ? { ...state, phase: 'repository', error: undefined } : { ...state, error: 'Enter or paste a valid GitHub token.' }
  if (state.phase === 'repository')
    return state.answers.owner && state.answers.repository ? { ...state, phase: 'template', error: undefined } : { ...state, error: 'GitHub owner and repository are required.' }
  if (state.phase === 'template')
    return { ...state, phase: 'preview', error: undefined }
  if (state.phase === 'preview')
    return { ...state, phase: 'confirmed', error: undefined }
  return state
}

export function PreviewWizard({ onExecute }: { onExecute?: WizardExecution } = {}) {
  const renderer = useRenderer()
  const clipboardRef = useRef<ReturnType<typeof createHostClipboard> | undefined>(undefined)
  if (!clipboardRef.current)
    clipboardRef.current = createHostClipboard()
  const clipboard = clipboardRef.current
  const [state, setState] = useState<WizardState>({ phase: 'token', token: '', answers: { owner: '', repository: '', repositoryMode: 'existing', privateRepository: true, inviteCollaborator: 'Oluwasetemi' }, templateIndex: 0, repositoryField: 'owner' })
  const template = BUILT_IN_TEMPLATES[state.templateIndex]!
  const plan = planCreation(template, { ...state.answers, owner: state.answers.owner || 'owner', repository: state.answers.repository || 'repository' })
  const journalPath = join(homedir(), '.local', 'state', 'generate-project-kanban', `${plan.fingerprint}.json`)
  const hasResumeJournal = existsSync(journalPath)
  const currentStep = WIZARD_STEPS.findIndex(step => step.phase === state.phase)
  const statusText = state.phase === 'confirmed'
    ? state.executionComplete ? 'Board created successfully' : 'Writing your board to GitHub'
    : WIZARD_STEPS[currentStep]?.label ?? 'Complete'
  const confirmPreview = () => {
    const next = advanceWizard(state)
    setState(next)
    if (state.phase === 'preview' && next.phase === 'confirmed') {
      const execution = onExecute?.(next)
      if (execution)
        void execution.then(executionSummary => setState(current => ({ ...current, executionComplete: true, executionSummary }))).catch(error => setState(current => ({ ...current, error: error instanceof Error ? error.message : String(error) })))
    }
  }
  usePaste((event) => {
    if (state.phase !== 'token')
      return
    const token = extractGithubToken(decodePasteBytes(event.bytes))
    setState(current => token ? { ...current, token, phase: 'repository', error: undefined } : { ...current, error: 'Clipboard does not contain a recognised GitHub token.' })
  })
  const readClipboardToken = async () => {
    const result = await clipboard.read({ preferredTypes: ['text/plain'], selection: 'clipboard' })
    if (result.status !== 'read') {
      setState(current => ({ ...current, error: 'The system clipboard could not be read. Use the terminal paste shortcut instead.' }))
      return
    }
    const token = extractGithubToken(new TextDecoder().decode(result.representation.bytes))
    setState(current => token ? { ...current, token, phase: 'repository', error: undefined } : { ...current, error: 'Clipboard does not contain a recognised GitHub token.' })
  }
  useKeyboard((key) => {
    if (isQuitKey(key)) {
      renderer.destroy()
      return
    }
    if (key.name === 'escape')
      renderer.destroy()
    if (state.phase === 'token' && (key.ctrl || key.meta) && key.name === 'v') { void readClipboardToken(); return }
    if (state.phase === 'repository' && key.name === 'tab') {
      const fields: WizardState['repositoryField'][] = ['owner', 'repository', 'mode']
      const next = fields[(fields.indexOf(state.repositoryField) + 1) % fields.length]!
      setState({ ...state, repositoryField: next })
      return
    }
    if (state.phase === 'token' && key.name === 'backspace')
      setState({ ...state, token: state.token.slice(0, -1) })
    if (state.phase === 'token' && key.name !== 'enter' && key.name !== 'backspace' && key.name !== 'escape' && key.sequence && !key.sequence.startsWith('\u001B')) {
      const pastedToken = extractGithubToken(key.sequence)
      const input = pastedToken ?? key.sequence.replace(/\W/g, '')
      if (input)
        setState({ ...state, token: pastedToken ?? state.token + input, phase: pastedToken ? 'repository' : state.phase, error: undefined })
    }
    if (key.name === 'enter' && state.phase === 'token') {
      const next = advanceWizard(state)
      setState(next)
    }
    if (state.phase === 'template' && (key.name === 'up' || key.name === 'k'))
      setState({ ...state, templateIndex: Math.max(0, state.templateIndex - 1) })
    if (state.phase === 'template' && (key.name === 'down' || key.name === 'j'))
      setState({ ...state, templateIndex: Math.min(BUILT_IN_TEMPLATES.length - 1, state.templateIndex + 1) })
  })
  return (
    <box flexDirection="column" width="100%" maxWidth={94} padding={2} gap={1} border borderColor="#30363d" backgroundColor="#0d1117" title=" PROJECT KANBAN " titleColor="#8be9fd">
      <box flexDirection="column" gap={1}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg="#f0f6fc"><strong>Generate a project board</strong></text>
          <text fg="#8b949e">{statusText}</text>
        </box>
        <text fg="#8b949e">Turn a course plan into a structured GitHub Project in a few deliberate steps.</text>
        <box flexDirection="row" gap={1}>
          {WIZARD_STEPS.map((step, index) => (
            <text key={step.phase} fg={index === currentStep ? '#58a6ff' : index < currentStep ? '#3fb950' : '#6e7681'}>
              {index < currentStep ? '[x]' : `${index + 1}`}
              {' '}
              {step.label}
            </text>
          ))}
        </box>
      </box>
      {state.phase === 'token' && (
        <box flexDirection="column" gap={1} border padding={2} borderColor="#30363d" title=" ACCESS " titleColor="#8be9fd">
          <text fg="#f0f6fc"><strong>Connect your GitHub account</strong></text>
          <text fg="#8b949e">Your token is used in memory only and is never written to disk.</text>
          <text fg="#58a6ff">{maskedToken(state.token) || 'Waiting for token input...'}</text>
          <text fg="#8b949e">Type or paste a token, then press Enter.</text>
        </box>
      )}
      {state.phase === 'repository' && (
        <box flexDirection="column" gap={1} border padding={2} borderColor="#30363d" title=" DESTINATION " titleColor="#8be9fd">
          <text fg="#f0f6fc"><strong>Where should the board live?</strong></text>
          <box flexDirection="column">
            <text fg={state.repositoryField === 'owner' ? '#58a6ff' : '#c9d1d9'}>GitHub owner</text>
            <input width="100%" focused={state.repositoryField === 'owner'} value={state.answers.owner} placeholder="user or organization" onInput={value => setState({ ...state, answers: { ...state.answers, owner: value } })} onSubmit={() => setState(current => current.answers.owner ? { ...current, repositoryField: 'repository', error: undefined } : { ...current, error: 'GitHub owner is required.' })} />
          </box>
          <box flexDirection="column">
            <text fg={state.repositoryField === 'repository' ? '#58a6ff' : '#c9d1d9'}>Repository name</text>
            <input width="100%" focused={state.repositoryField === 'repository'} value={state.answers.repository} placeholder="repository name" onInput={value => setState({ ...state, answers: { ...state.answers, repository: value } })} onSubmit={() => setState(current => current.answers.owner && current.answers.repository ? { ...current, repositoryField: 'mode', error: undefined } : { ...current, error: 'GitHub owner and repository are required.' })} />
          </box>
          <box flexDirection="column">
            <text fg={state.repositoryField === 'mode' ? '#58a6ff' : '#c9d1d9'}>Repository mode</text>
            <select width="100%" focused={state.repositoryField === 'mode'} height={3} backgroundColor="#161b22" focusedBackgroundColor="#21262d" selectedBackgroundColor="#1f6feb" options={[{ name: 'Use existing repository', description: 'Add the board to a repository you can write', value: 'existing' }, { name: 'Create private repository and invite @Oluwasetemi', description: 'Create a private repository after confirmation', value: 'create' }]} onChange={index => setState({ ...state, answers: { ...state.answers, repositoryMode: index === 1 ? 'create' : 'existing' } })} onSelect={index => setState(current => advanceWizard({ ...current, answers: { ...current.answers, repositoryMode: index === 1 ? 'create' : 'existing' } }))} />
          </box>
        </box>
      )}
      {state.phase === 'template' && (
        <box flexDirection="column" gap={1} border padding={2} borderColor="#30363d" title=" TEMPLATE " titleColor="#8be9fd">
          <text fg="#f0f6fc"><strong>Choose a planning template</strong></text>
          <text fg="#8b949e">Use the arrow keys to compare the five built-in project structures.</text>
          <select focused height={8} width="100%" selectedIndex={state.templateIndex} backgroundColor="#161b22" focusedBackgroundColor="#21262d" selectedBackgroundColor="#1f6feb" options={BUILT_IN_TEMPLATES.map(item => ({ name: item.name, description: item.summary, value: item.id }))} onChange={index => setState({ ...state, templateIndex: index })} onSelect={() => setState(advanceWizard)} />
        </box>
      )}
      {(state.phase === 'preview' || state.phase === 'confirmed') && (
        <box flexDirection="column" gap={1} border padding={2} borderColor={state.phase === 'confirmed' ? '#3fb950' : '#30363d'} title=" REVIEW " titleColor="#8be9fd">
          <text fg="#f0f6fc"><strong>{template.name}</strong></text>
          <text fg="#8b949e">{template.summary}</text>
          <box flexDirection="row" gap={3}>
            <text fg="#c9d1d9">
              Repository:
              <strong>
                {plan.answers.owner}
                /
                {plan.answers.repository}
              </strong>
            </text>
            <text fg="#c9d1d9">
              Actions:
              <strong>{plan.actions.length}</strong>
            </text>
          </box>
          <text fg="#8b949e">
            Mode:
            {plan.answers.repositoryMode}
            {' '}
            -  Plan:
            {plan.fingerprint}
          </text>
          {hasResumeJournal && <text fg="#3fb950">Existing journal found. Pending or failed actions will resume.</text>}
          <text fg="#f0f6fc">{state.phase === 'preview' ? 'Press Enter to confirm all GitHub writes.' : 'Execution is in progress. Keep this terminal open.'}</text>
        </box>
      )}
      {state.phase === 'preview' && <select focused width="100%" height={1} backgroundColor="#161b22" focusedBackgroundColor="#238636" selectedBackgroundColor="#238636" options={[{ name: '  Confirm and create project board  ', description: 'Press Enter to continue', value: 'confirm' }]} onSelect={confirmPreview} />}
      {state.executionSummary && (
        <box flexDirection="column" gap={1} border padding={2} borderColor="#3fb950" title=" COMPLETE " titleColor="#3fb950">
          <text fg="#3fb950"><strong>{state.executionSummary.resumed ? 'Resume complete' : 'Creation complete'}</strong></text>
          <text fg="#c9d1d9">{state.executionSummary.resumed ? 'The existing journal was resumed successfully.' : 'Your GitHub Project was created successfully.'}</text>
          <text>
            Completed actions:
            {' '}
            <strong>
              {state.executionSummary.completedActions}
            </strong>
          </text>
          {state.executionSummary.repositoryUrl && (
            <text>
              Repository:
              <a href={state.executionSummary.repositoryUrl}>{state.executionSummary.repositoryUrl}</a>
            </text>
          )}
          {state.executionSummary.projectUrl && (
            <text>
              Project:
              <a href={state.executionSummary.projectUrl}>{state.executionSummary.projectUrl}</a>
            </text>
          )}
          <text>
            Journal:
            {state.executionSummary.journalPath}
          </text>
        </box>
      )}
      {state.error && (
        <box border padding={1} borderColor="#f85149">
          <text fg="#ff7b72">
            <strong>Something went wrong</strong>
            {' '}
            {state.error}
          </text>
        </box>
      )}
      <box flexDirection="row" justifyContent="space-between">
        <text fg="#8b949e">Enter continue  |  Up/Down select  |  Tab next field</text>
        <text fg="#8b949e">Esc cancel  |  Ctrl+C quit</text>
      </box>
    </box>
  )
}
