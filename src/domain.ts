export const WEEKS = [1, 2, 3, 4, 5, 6] as const
export type Week = (typeof WEEKS)[number]
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export interface Milestone {
  week: Week
  name: string
  objectives: string
  deliverables: string
  evidence: string
  weight: number
}

export const CATEGORIES = ['setup', 'functional', 'auth', 'security', 'data', 'testing', 'deployment'] as const
export type Category = (typeof CATEGORIES)[number]
export interface Epic { id: string, name: string, description: string, label?: string, role?: string, action?: string, benefit?: string }
export interface Story {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  epicId: string
  week: Week
  priority: Priority
  role: string
  action: string
  benefit: string
  category: Category
  dependsOn?: string[]
}
export interface Assessment { id: string, title: string, week: 2 | 4 | 6, weight: 10 | 15 | 25 }
export interface GradeMetadata { weeklyTotal: number, presentationTotal: number, overallTotal: number }

export interface ProjectTemplate {
  version: 1
  id: string
  name: string
  summary: string
  stack: string[]
  epics: Epic[]
  stories: Story[]
  acceptanceChecklists?: Partial<Record<Category, string[]>>
  milestones: Milestone[]
  assessments: Assessment[]
  grade: GradeMetadata
}

export type ValidationResult = { valid: true } | { valid: false, errors: string[] }

export interface CreationAnswers {
  owner: string
  repository: string
  repositoryMode: 'create' | 'existing'
  privateRepository: boolean
  inviteCollaborator?: string
}

export interface PlanAction {
  key: string
  kind: 'repository' | 'project' | 'field' | 'label' | 'epic' | 'story' | 'assessment' | 'relationship' | 'item' | 'invitation'
  title: string
  marker: string
  dependsOn: string[]
  data?: Record<string, string | number | boolean | string[]>
}

export interface CreationPlan {
  fingerprint: string
  templateId: string
  answers: CreationAnswers
  actions: PlanAction[]
}

export type JournalActionState = 'pending' | 'in-progress' | 'completed' | 'failed'
export type JournalAction = PlanAction & {
  state: JournalActionState
  resourceId?: string
  resourceUrl?: string
  error?: string
  reconciliationKey: string
}
export interface ExecutionJournal {
  schemaVersion: 1
  planFingerprint: string
  templateId: string
  answers: CreationAnswers
  actions: JournalAction[]
  nextPendingAction?: string
  updatedAt: string
}
