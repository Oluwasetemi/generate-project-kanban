import type { ProjectTemplate } from './domain'
import { parse } from 'yaml'
import contentCmsYaml from '../templates/content-cms.yaml' with { type: 'text' }
import ecommerceAdminYaml from '../templates/ecommerce-admin.yaml' with { type: 'text' }
import lmsPortalYaml from '../templates/lms-portal.yaml' with { type: 'text' }
import realTimeKanbanYaml from '../templates/real-time-kanban.yaml' with { type: 'text' }
import telemedicinePortalYaml from '../templates/telemedicine-portal.yaml' with { type: 'text' }
import { explicitBacklog, generateBacklog } from './story-system'
import { assertValidTemplate, canonicalMilestones } from './validation'

const assessments = [{ id: 'assessment-week-2', title: 'Week 2 Presentation', week: 2 as const, weight: 10 as const }, { id: 'assessment-week-4', title: 'Week 4 Presentation', week: 4 as const, weight: 15 as const }, { id: 'assessment-week-6', title: 'Week 6 Final Defense', week: 6 as const, weight: 25 as const }]

interface TemplateSource { version: 1, id: string, name: string, summary: string, stack: string[], epics: ProjectTemplate['epics'], stories: ProjectTemplate['stories'], acceptanceChecklists?: ProjectTemplate['acceptanceChecklists'], modules?: string[], persona?: string, benefit?: string }

function makeTemplate(source: TemplateSource): ProjectTemplate {
  const { id, name, summary, stack } = source
  const backlog = source.epics && source.stories
    ? explicitBacklog({
        epics: source.epics,
        stories: source.stories.map(story => ({ ...story, epicId: (story as StorySource).epic ?? story.epicId, description: story.description || `As a ${story.role}, I want to ${story.action}, so that ${story.benefit}.` })),
        acceptanceChecklists: source.acceptanceChecklists,
      }, id)
    : generateBacklog({ id, name, modules: source.modules ?? [], storyThemes: [], persona: source.persona ?? 'user', productBenefit: source.benefit ?? 'complete the workflow' })
  return assertValidTemplate({ version: 1, id, name, summary, stack, ...backlog, milestones: canonicalMilestones(), assessments, grade: { weeklyTotal: 50, presentationTotal: 50, overallTotal: 100 } })
}

type StorySource = ProjectTemplate['stories'][number] & { epic?: string }

export const BUILT_IN_TEMPLATES: readonly ProjectTemplate[] = [
  ...[ecommerceAdminYaml, realTimeKanbanYaml, telemedicinePortalYaml, lmsPortalYaml, contentCmsYaml].map(source => makeTemplate(parse(source) as TemplateSource)),
]

export function getTemplate(id: string) { return BUILT_IN_TEMPLATES.find(template => template.id === id) }
