import type { ProjectTemplate, ValidationResult } from './domain'
import { CATEGORIES, WEEKS } from './domain'

export const CANONICAL_MILESTONES = [
  [1, 'Setup, Architecture and Type Definitions', 'Repository, ESLint, TypeScript strict mode, core domain interfaces, router, design tokens, and base layout shell', 'Repository link, merged setup PR, tsc --noEmit with no errors', 6],
  [2, 'Base Shell and Mock API Layer', 'Responsive shell/navigation, initial routes, MSW or mock data layer, and reusable atomic UI components', 'Navigation and mock-data recording; Storybook or component-preview link', 6],
  [3, 'Core Functionality and State Management', 'Global state, validated forms, and primary user workflows functioning end to end', 'PR for state logic and demo of form interaction plus cross-route state persistence', 6],
  [4, 'Advanced TypeScript and API Integration', 'Real or mock endpoint integration, generic/dynamic components, loading/error/empty states, and error boundaries', 'Code review showing generics and live offline/error-state demonstration', 6],
  [5, 'Testing, Optimization and Accessibility', 'Critical unit/integration tests, performance work, Lighthouse score of at least 85, and keyboard navigation', 'Vitest report or coverage export and Lighthouse audit PDF', 6],
  [6, 'Deployment, CI/CD and Final Defense', 'CI/CD deployment, final fixes, complete documentation, production launch, and presentation', 'Live URL, presentation delivery, and live codebase Q&A', 20],
] as const

export function canonicalMilestones() {
  return CANONICAL_MILESTONES.map(([week, name, objectives, evidence, weight]) => ({
    week,
    name,
    objectives,
    deliverables: objectives,
    evidence,
    weight,
  }))
}

/** Reports every template invariant failure in one pass. */
// eslint-disable-next-line sonarjs/cognitive-complexity
export function validateTemplate(template: ProjectTemplate): ValidationResult {
  const errors: string[] = []
  if (template.version !== 1 || !template.id || !template.name || !template.summary || template.stack.length === 0)
    errors.push('template metadata and technology stack are required')
  if (template.epics.length === 0 || template.stories.length === 0)
    errors.push('at least one epic and story are required')
  const ids = [...template.epics.map(e => e.id), ...template.stories.map(s => s.id), ...template.assessments.map(a => a.id)]
  if (new Set(ids).size !== ids.length)
    errors.push('all epic, story, and assessment IDs must be unique')
  if (ids.some(id => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))
    errors.push('all IDs must be lowercase kebab-case')
  if (template.milestones.length !== 6 || template.milestones.some((m, i) => m.week !== WEEKS[i]))
    errors.push('all six canonical weeks are required in order')
  for (const [i, expected] of CANONICAL_MILESTONES.entries()) {
    const actual = template.milestones[i]
    if (!actual || actual.name !== expected[1] || actual.objectives !== expected[2] || actual.evidence !== expected[3] || actual.weight !== expected[4])
      errors.push(`week ${expected[0]} does not match the canonical milestone`)
  }
  const epicIds = new Set(template.epics.map(e => e.id))
  for (const epic of template.epics) {
    if (!epic.id || !epic.name || !epic.description || !epic.role || !epic.action || !epic.benefit)
      errors.push(`epic ${epic.id || '(missing id)'} requires role, action, benefit, and description`)
  }
  for (const story of template.stories) {
    if (!story.id || !story.title || !story.description || !story.role || !story.action || !story.benefit || story.acceptanceCriteria.length < 3)
      errors.push(`story ${story.id || '(missing id)'} is missing required content`)
    if (!epicIds.has(story.epicId))
      errors.push(`story ${story.id} references an unknown epic`)
    if (!WEEKS.includes(story.week))
      errors.push(`story ${story.id} has an invalid week`)
    if (!['P0', 'P1', 'P2', 'P3'].includes(story.priority))
      errors.push(`story ${story.id} has an invalid priority`)
    if (!CATEGORIES.includes(story.category))
      errors.push(`story ${story.id} has an invalid category`)
    if (story.dependsOn?.some(dependency => !template.stories.some(candidate => candidate.id === dependency)))
      errors.push(`story ${story.id} has an unknown dependency`)
    if (story.dependsOn?.includes(story.id))
      errors.push(`story ${story.id} cannot depend on itself`)
    if (story.acceptanceCriteria.some(criterion => !criterion.trim()))
      errors.push(`story ${story.id} has an empty acceptance criterion`)
  }
  for (const week of WEEKS) {
    if (!template.stories.some(story => story.week === week))
      errors.push(`week ${week} must have planned work`)
  }
  const expectedAssessments = new Map([[2, 10], [4, 15], [6, 25]])
  if (template.assessments.length !== 3 || new Set(template.assessments.map(assessment => assessment.week)).size !== 3 || template.assessments.some(a => expectedAssessments.get(a.week) !== a.weight))
    errors.push('assessments must be weeks 2, 4, and 6 with weights 10, 15, and 25')
  const weeklyTotal = template.milestones.reduce((sum, m) => sum + m.weight, 0)
  const presentationTotal = template.assessments.reduce((sum, a) => sum + a.weight, 0)
  if (weeklyTotal !== 50 || presentationTotal !== 50 || weeklyTotal + presentationTotal !== 100)
    errors.push('grade weights must total 50% weekly, 50% presentation, and 100% overall')
  if (template.grade.weeklyTotal !== weeklyTotal || template.grade.presentationTotal !== presentationTotal || template.grade.overallTotal !== 100)
    errors.push('grade metadata does not match calculated weights')
  for (const [category, checklist] of Object.entries(template.acceptanceChecklists ?? {})) {
    if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number]) || !Array.isArray(checklist) || checklist.length < 3)
      errors.push(`acceptance checklist ${category} is invalid`)
  }
  return errors.length ? { valid: false, errors } : { valid: true }
}

export function assertValidTemplate(template: ProjectTemplate): ProjectTemplate {
  const result = validateTemplate(template)
  if (!result.valid)
    throw new Error(result.errors.join('; '))
  return template
}
