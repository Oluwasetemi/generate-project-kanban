import type { Category, Epic, Priority, Story, Week } from './domain'

export interface BacklogInput {
  id: string
  name: string
  modules: string[]
  storyThemes: string[]
  persona: string
  productBenefit: string
}

export interface ExplicitBacklog { epics: Epic[], stories: Story[], acceptanceChecklists?: Partial<Record<Category, string[]>> }

const categories = ['setup', 'functional', 'auth', 'security', 'data', 'testing', 'deployment'] as const
const priorities: Priority[] = ['P0', 'P0', 'P1', 'P1', 'P2', 'P2']

const categoryCriteria: Record<(typeof categories)[number], string[]> = {
  setup: ['The route and primary UI are reachable from the base shell', 'The first render has a useful loading and empty state', 'The feature is usable with keyboard navigation'],
  functional: ['The primary happy path can be completed from start to finish', 'Successful completion gives clear feedback and updates the relevant view', 'Refresh and back navigation preserve a safe, understandable state'],
  auth: ['Unauthenticated users are redirected to a safe entry point', 'Authorized and unauthorized states are distinct', 'Session failure does not expose protected data'],
  security: ['Sensitive values are not rendered, logged, or persisted', 'Input is constrained at the boundary', 'Failure responses do not disclose implementation details'],
  data: ['The API or mock boundary has typed request and response models', 'Loading, success, empty, and error states are represented', 'A failed request can be retried without duplicating data'],
  testing: ['Critical interactions have unit or integration test coverage', 'The feature has an accessible name, focus order, and keyboard operation', 'The implementation avoids unnecessary work on the critical path'],
  deployment: ['The feature is documented with setup and usage notes', 'The production build completes with strict TypeScript checks', 'The final workflow is demonstrated with reproducible evidence'],
}

function sentence(value: string): string { return value.trim().replace(/\.+$/, '') }

export function generateBacklog(input: BacklogInput): { epics: Epic[], stories: Story[] } {
  const epics = input.modules.map((module, index) => ({
    id: `${input.id}-epic-${index + 1}`,
    name: module,
    label: module,
    role: input.persona,
    benefit: input.productBenefit,
    description: `Functional module for ${module.toLowerCase()}. It helps a ${input.persona} ${input.productBenefit.toLowerCase()}.`,
  }))
  const stories = input.storyThemes.map((theme, index) => {
    const category = categories[index % categories.length]!
    const week = (Math.floor(index / 2) + 1) as Week
    const epic = epics[index % epics.length]!
    const role = input.persona
    const benefit = input.productBenefit
    const criteria = [
      `A ${role} can ${sentence(theme).toLowerCase()} from the ${epic.name.toLowerCase()} module`,
      ...categoryCriteria[category],
      `Completion is demonstrated with a reproducible test, screenshot, recording, or deployed URL`,
    ]
    return {
      id: `${input.id}-story-${String(index + 1).padStart(2, '0')}`,
      title: sentence(theme),
      action: sentence(theme).toLowerCase(),
      description: `As a ${role}, I want to ${sentence(theme).toLowerCase()} so that I can ${benefit.toLowerCase()}.\n\nScope: implement the ${category} slice with a clear boundary between UI state and API or mock data. Include the evidence needed for Week ${week}.`,
      acceptanceCriteria: criteria,
      epicId: epic.id,
      week,
      priority: priorities[index % priorities.length]!,
      role,
      benefit,
      category,
    } satisfies Story
  })
  return { epics, stories }
}

export const SHARED_ACCEPTANCE_CHECKLISTS: Record<Category, string[]> = {
  setup: ['The route is reachable from the base shell', 'The implementation passes strict TypeScript checks', 'A loading or empty state is present where applicable'],
  functional: ['The primary happy path can be completed from start to finish', 'Success is visible and the relevant view updates', 'Keyboard users can complete the workflow'],
  auth: ['Unauthenticated users are redirected to a safe entry point', 'Authorized and unauthorized states are distinct', 'Session failure does not expose protected data'],
  security: ['Sensitive values are not rendered, logged, or persisted', 'Input is constrained at the boundary', 'Failure responses do not disclose implementation details'],
  data: ['Request and response models are typed', 'Loading, empty, success, and error states are represented', 'Retrying cannot duplicate data'],
  testing: ['Critical behavior has automated test coverage', 'Tests cover a failure or boundary case', 'The feature has an accessible name and focus order'],
  deployment: ['The production build completes with strict checks', 'Setup and usage are documented', 'A reproducible deployed or recorded demonstration exists'],
}

export function explicitBacklog(backlog: ExplicitBacklog, projectId?: string): ExplicitBacklog {
  const acceptanceChecklists = { ...SHARED_ACCEPTANCE_CHECKLISTS, ...backlog.acceptanceChecklists }
  const foundationId = projectId ? `${projectId}-epic-foundation` : undefined
  const foundationEpic: Epic[] = foundationId
    ? [{
        id: foundationId,
        name: 'Project foundation',
        label: 'Project foundation',
        role: 'project team',
        action: 'establish the application foundation and release guardrails',
        benefit: 'build and ship the product reliably',
        description: 'Shared setup, architecture, security, quality, and deployment foundation for the project.',
      }]
    : []
  const foundationStories: Story[] = foundationId
    ? [
        ['repository-toolchain', 'Initialize the repository and toolchain', 'initialize the repository with the agreed frontend toolchain', 'start from a reproducible project baseline', 'setup', 1, 'P0'],
        ['strict-quality', 'Configure TypeScript, linting, formatting, and CI', 'configure strict TypeScript, linting, formatting, and CI checks', 'catch defects before they reach review', 'setup', 1, 'P0'],
        ['runtime-config', 'Validate runtime configuration and secrets', 'validate runtime configuration without exposing secrets', 'run safely in local, preview, and production environments', 'security', 1, 'P0'],
        ['application-shell', 'Build the router, shell, and design tokens', 'build the responsive router, application shell, and design tokens', 'give every feature a consistent accessible home', 'setup', 2, 'P0'],
        ['domain-boundary', 'Define domain contracts and the API boundary', 'define domain interfaces and a typed mock or API boundary', 'replace data sources without rewriting feature components', 'data', 2, 'P0'],
        ['failure-conventions', 'Standardize loading, empty, error, and recovery states', 'standardize loading, empty, error, and retry behavior', 'make failures understandable instead of blocking the product', 'data', 4, 'P1'],
        ['quality-baseline', 'Establish testing and accessibility baselines', 'establish critical test coverage and keyboard accessibility baselines', 'ship changes with measurable confidence', 'testing', 5, 'P1'],
        ['release-readiness', 'Document deployment, observability, and rollback', 'document deployment, observability, migration, and rollback steps', 'operate the project after the final defense', 'deployment', 6, 'P1'],
      ].map(([suffix, title, action, benefit, category, week, priority]) => ({
        id: `${projectId}-story-${suffix}`,
        title: String(title),
        action: String(action),
        benefit: String(benefit),
        role: 'project team',
        description: `As a project team, I want to ${action} so that I can ${benefit}.`,
        acceptanceCriteria: [
          `The ${String(title).toLowerCase()} workflow is documented and reproducible`,
          'The implementation passes the relevant automated check',
          'Failure behavior is visible and recoverable',
        ],
        epicId: foundationId,
        category: category as Category,
        week: Number(week) as Week,
        priority: priority as Priority,
      } satisfies Story))
    : []
  return {
    ...backlog,
    epics: [...foundationEpic, ...backlog.epics],
    stories: [...foundationStories, ...backlog.stories].map(story => ({ ...story, acceptanceCriteria: [...story.acceptanceCriteria, ...(acceptanceChecklists[story.category] ?? [])] })),
    acceptanceChecklists,
  }
}
