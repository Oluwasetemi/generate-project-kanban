import type { PlanAction } from './domain'

export interface GitHubResource { id: string, url?: string }
export type GraphQLRequest = (query: string, variables?: Record<string, unknown>) => Promise<unknown>

/** The token is held only by this adapter instance and is never serialised. */
export class BunGitHubAdapter implements GitHubAdapter {
  private readonly graphqlRequest: GraphQLRequest
  private readonly restRequest: (path: string, init?: RequestInit) => Promise<unknown>
  private readonly owner: string
  private readonly repository: string
  private readonly repositoryMode: 'create' | 'existing'
  private repositoryId?: string
  private projectId?: string
  private ownerId?: string
  private ownerIsOrganization = false
  private readonly fieldIds = new Map<string, string>()
  private readonly fieldOptions = new Map<string, Map<string, string>>()

  constructor(options: { token: string, owner: string, repository: string, repositoryMode?: 'create' | 'existing', projectId?: string, fetch?: typeof fetch, graphqlUrl?: string, apiUrl?: string }) {
    if (!options.token)
      throw new Error('A GitHub token is required at runtime')
    this.owner = options.owner.trim().replace(/^@/, '')
    this.repository = options.repository
    this.repositoryMode = options.repositoryMode ?? 'existing'
    this.projectId = options.projectId
    const fetcher = options.fetch ?? fetch
    const graphqlUrl = options.graphqlUrl ?? 'https://api.github.com/graphql'
    const apiUrl = options.apiUrl ?? 'https://api.github.com'
    const headers = { 'authorization': `Bearer ${options.token}`, 'accept': 'application/vnd.github+json', 'content-type': 'application/json' }
    this.graphqlRequest = async (query, variables = {}) => {
      const response = await fetcher(graphqlUrl, { method: 'POST', headers, body: JSON.stringify({ query, variables }) })
      const body = await response.json() as { data?: unknown, errors?: Array<{ message: string }> }
      if (!response.ok || body.errors?.length)
        throw new Error(body.errors?.map(error => error.message).join(', ') ?? `GitHub GraphQL request failed (${response.status})`)
      return body.data
    }
    this.restRequest = async (path, init = {}) => {
      const response = await fetcher(`${apiUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
      const body = await response.json().catch(() => undefined)
      if (!response.ok)
        throw new Error(`GitHub REST request failed (${response.status})`)
      return body
    }
  }

  async preflight(): Promise<PreflightReport> {
    interface Owner { id: string, isOrganization: boolean, canCreateProjects: boolean, canCreateRepositories: boolean }
    let owner: Owner
    let viewerLogin: string
    try {
      const userData = await this.graphqlRequest(`query ResolveUser($login: String!) { viewer { login } user(login: $login) { id } }`, { login: this.owner }) as { viewer: { login: string }, user: { id: string } | null }
      if (!userData.user)
        throw new Error(`Personal account '${this.owner}' was not found`)
      owner = { id: userData.user.id, isOrganization: false, canCreateProjects: true, canCreateRepositories: true }
      viewerLogin = userData.viewer.login
    }
    catch (userError) {
      const organizationData = await this.graphqlRequest(`query ResolveOrganization($login: String!) { viewer { login } organization(login: $login) { id viewerCanCreateProjects viewerCanCreateRepositories } }`, { login: this.owner }) as { viewer: { login: string }, organization: { id: string, viewerCanCreateProjects: boolean, viewerCanCreateRepositories: boolean } | null }
      if (!organizationData.organization)
        throw userError
      owner = { id: organizationData.organization.id, isOrganization: true, canCreateProjects: organizationData.organization.viewerCanCreateProjects, canCreateRepositories: organizationData.organization.viewerCanCreateRepositories }
      viewerLogin = organizationData.viewer.login
    }
    interface RepositoryData { repository: { id: string, owner: { __typename: 'User' | 'Organization', id: string, viewerCanCreateProjects?: boolean, viewerCanCreateRepositories?: boolean }, projectsV2?: { nodes: Array<{ id: string, shortDescription: string, fields: { nodes: Array<{ id: string, name: string, options?: Array<{ id: string, name: string }> }> } }> } } | null, rateLimit: { remaining: number, resetAt: string } }
    let data: RepositoryData
    try {
      data = await this.graphqlRequest(`query PreflightRepository($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { id owner { __typename ... on User { id } ... on Organization { id viewerCanCreateProjects viewerCanCreateRepositories } } projectsV2(first: 50) { nodes { id shortDescription fields(first: 100) { nodes { ... on ProjectV2Field { id name } ... on ProjectV2SingleSelectField { id name options { id name } } } } } } } rateLimit { remaining resetAt } }`, { owner: this.owner, repo: this.repository }) as RepositoryData
    }
    catch (error) {
      if (this.repositoryMode !== 'create')
        throw error
      const rateLimit = await this.graphqlRequest('query RateLimit { rateLimit { remaining resetAt } }') as RepositoryData['rateLimit']
      data = { repository: null, rateLimit }
    }
    this.repositoryId = data.repository?.id
    this.ownerId = data.repository?.owner?.id ?? owner.id
    this.ownerIsOrganization = data.repository?.owner?.__typename === 'Organization' || owner.isOrganization
    const project = data.repository?.projectsV2?.nodes.find(candidate => candidate.shortDescription?.includes('Generated by generate-project-kanban'))
    this.projectId = project?.id ?? this.projectId
    for (const field of project?.fields.nodes ?? []) {
      this.fieldIds.set(field.name, field.id)
      if (field.options)
        this.fieldOptions.set(field.name, new Map(field.options.map(option => [option.name, option.id])))
    }
    return { login: viewerLogin, canReadRepository: Boolean(data.repository), canWriteRepository: Boolean(data.repository), canCreateRepository: owner.canCreateRepositories, canUseProjects: owner.canCreateProjects, rateLimitRemaining: data.rateLimit.remaining, rateLimitResetAt: data.rateLimit.resetAt }
  }

  async reconcile(action: PlanAction, reconciliationKey: string): Promise<GitHubResource[]> {
    if (action.kind === 'repository') {
      try {
        const data = await this.restRequest(`/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}`) as { id: number, html_url: string }
        return [{ id: String(data.id), url: data.html_url }]
      }
      catch { return [] }
    }
    if (action.kind === 'project' && this.ownerId) {
      const ownerProjects = await this.graphqlRequest(`query ReconcileOwnerProjects($owner: ID!) { node(id: $owner) { ... on User { projectsV2(first: 100) { nodes { id url shortDescription } } } ... on Organization { projectsV2(first: 100) { nodes { id url shortDescription } } } } }`, { owner: this.ownerId }) as { node?: { projectsV2?: { nodes: Array<{ id: string, url: string, shortDescription: string }> } } }
      return (ownerProjects.node?.projectsV2?.nodes ?? []).filter(project => project.shortDescription?.includes(reconciliationKey)).map(project => ({ id: project.id, url: project.url }))
    }
    const query = `query Reconcile($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id issues(first: 100) { nodes { id url body } } projectsV2(first: 50) { nodes { id url shortDescription items(first: 100) { nodes { id content { ... on Issue { id body url } } } } } } labels(first: 100) { nodes { id name } } } }`
    const data = await this.graphqlRequest(query, { owner: this.owner, name: this.repository }) as { repository?: { issues: { nodes: Array<{ id: string, url: string, body: string }> }, projectsV2: { nodes: Array<{ id: string, url: string, shortDescription: string, items: { nodes: Array<{ id: string, content: { id: string, body: string, url: string } | null }> } }> }, labels: { nodes: Array<{ id: string, name: string }> } } }
    const repository = data.repository
    if (!repository)
      return []
    if (action.kind === 'project')
      return repository.projectsV2.nodes.filter(item => item.shortDescription?.includes(reconciliationKey)).map(item => ({ id: item.id, url: item.url }))
    if (action.kind === 'label')
      return repository.labels.nodes.filter(item => item.name === action.data?.name).map(item => ({ id: item.id }))
    if (action.kind === 'field') {
      const fields = await this.graphqlRequest(`query($project: ID!) { node(id: $project) { ... on ProjectV2 { fields(first: 100) { nodes { ... on ProjectV2Field { id name } ... on ProjectV2SingleSelectField { id name } } } } } }`, { project: this.projectId }) as { node?: { fields?: { nodes: Array<{ id: string, name: string }> } } }
      return (fields.node?.fields?.nodes ?? []).filter(field => field.name === action.data?.name).map(field => ({ id: field.id }))
    }
    if (action.kind === 'item') {
      const issueMarker = action.marker.replace(/^item:/, '')
      return repository.projectsV2.nodes.flatMap(project => project.items.nodes.filter(item => item.content?.body?.includes(issueMarker)).map(item => ({ id: item.id, url: item.content?.url })))
    }
    return repository.issues.nodes.filter(item => item.body?.includes(reconciliationKey)).map(item => ({ id: item.id, url: item.url }))
  }

  /** Coordinates the ordered GitHub mutation types and their dependent state. */
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async execute(action: PlanAction, reconciliationKey: string): Promise<GitHubResource> {
    if (action.kind === 'repository') {
      const createPath = this.ownerIsOrganization ? `/orgs/${encodeURIComponent(this.owner)}/repos` : '/user/repos'
      const body = await this.restRequest(createPath, { method: 'POST', body: JSON.stringify({ name: this.repository, private: action.data?.private ?? true, description: `Generated project board (${reconciliationKey})` }) }) as { id: number, html_url: string, owner?: { node_id?: string, type?: string } }
      this.repositoryId = String(body.id)
      if (body.owner?.node_id)
        this.ownerId = body.owner.node_id
      if (body.owner?.type)
        this.ownerIsOrganization = body.owner.type === 'Organization'
      await this.refreshOwnerNodeId()
      return { id: String(body.id), url: body.html_url }
    }
    if (!this.repositoryId) {
      const repo = await this.restRequest(`/repos/${this.owner}/${this.repository}`) as { id: number }
      this.repositoryId = String(repo.id)
    }
    if (action.kind === 'invitation') {
      await this.restRequest(`/repos/${this.owner}/${this.repository}/collaborators/${action.data?.login}`, { method: 'PUT', body: JSON.stringify({ permission: 'push' }) })
      return { id: `invitation:${action.data?.login}` }
    }
    if (action.kind === 'label')
      return this.graphqlResource(`mutation($repo: ID!, $name: String!, $marker: String!) { createLabel(input: { repositoryId: $repo, name: $name, color: "0366D6", description: $marker }) { label { id } } }`, { repo: this.repositoryId, name: action.data?.name, marker: reconciliationKey }, 'createLabel.label')
    if (action.kind === 'project') {
      await this.refreshOwnerNodeId()
      const resource = await this.graphqlResource(`mutation($owner: ID!, $title: String!, $repository: ID) { createProjectV2(input: { ownerId: $owner, title: $title, repositoryId: $repository }) { projectV2 { id number url } } }`, { owner: this.ownerId ?? this.repositoryId, title: String(action.data?.title), repository: this.repositoryId }, 'createProjectV2.projectV2')
      this.projectId = resource.id
      await this.graphqlRequest(`mutation($project: ID!, $description: String!) { updateProjectV2(input: { projectId: $project, shortDescription: $description }) { projectV2 { id } } }`, { project: resource.id, description: reconciliationKey })
      return resource
    }
    if (action.kind === 'field' && action.data?.name === 'Status') {
      const result = await this.graphqlRequest(`query($project: ID!) { node(id: $project) { ... on ProjectV2 { fields(first: 50) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }`, { project: this.projectId }) as { node: { fields: { nodes: Array<{ id: string, name: string, options: Array<{ id: string, name: string }> }> } } }
      const status = result.node.fields.nodes.find(field => field.name === 'Status')
      if (!status || !(action.data.options as string[]).every(option => status.options.some(current => current.name === option)))
        throw new Error('Project is missing the required built-in Status options')
      this.fieldIds.set('Status', status.id)
      this.fieldOptions.set('Status', new Map(status.options.map(option => [option.name, option.id])))
      return { id: status.id }
    }
    if (action.kind === 'field') {
      const resource = await this.graphqlResource(`mutation($project: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) { createProjectV2Field(input: { projectId: $project, dataType: SINGLE_SELECT, name: $name, singleSelectOptions: $options }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }`, { project: this.projectId, name: action.data?.name, options: (action.data?.options as string[]).map(option => ({ name: option, color: 'BLUE', description: option })) }, 'createProjectV2Field.projectV2Field')
      this.fieldIds.set(String(action.data?.name), resource.id)
      const fields = await this.graphqlRequest(`query($project: ID!) { node(id: $project) { ... on ProjectV2 { fields(first: 100) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }`, { project: this.projectId }) as { node?: { fields?: { nodes: Array<{ id: string, name: string, options: Array<{ id: string, name: string }> }> } } }
      const field = fields.node?.fields?.nodes.find(item => item.id === resource.id)
      if (field)
        this.fieldOptions.set(field.name, new Map(field.options.map(option => [option.name, option.id])))
      return resource
    }
    if (action.kind === 'relationship')
      return this.graphqlResource(`mutation($parent: ID!, $child: ID!) { addSubIssue(input: { issueId: $parent, subIssueId: $child }) { subIssue { id } } }`, { parent: action.data?.parentId, child: action.data?.childId }, 'addSubIssue.subIssue')
    if (action.kind === 'item') {
      const item = await this.graphqlResource(`mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`, { project: this.projectId, content: action.data?.contentId }, 'addProjectV2ItemById.item')
      for (const [name, value] of [['Status', 'Todo'], ['Week', action.data?.week], ['Epic', action.data?.epic], ['Priority', action.data?.priority]] as const) {
        const fieldId = this.fieldIds.get(name)
        const optionId = typeof value === 'string' ? this.fieldOptions.get(name)?.get(value) : undefined
        if (!fieldId || !optionId)
          continue
        await this.graphqlRequest(`mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) { updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $value } }) { projectV2Item { id } } }`, { project: this.projectId, item: item.id, field: fieldId, value: optionId })
      }
      return item
    }
    const title = String(action.data?.title ?? action.title)
    const body = `${String(action.data?.body ?? action.title)}\n\nmarker: ${reconciliationKey}`
    const requestedLabels = action.data?.labels as string[] | undefined
    const labelNames = requestedLabels ?? (action.data?.label ? [String(action.data.label)] : [])
    if (labelNames.length > 4)
      throw new Error('An issue may have at most four generated labels')
    const labels = labelNames.length > 0 ? await this.graphqlRequest(`query($repo: ID!) { node(id: $repo) { ... on Repository { labels(first: 100) { nodes { id name } } } } }`, { repo: this.repositoryId }) as { node?: { labels?: { nodes: Array<{ id: string, name: string }> } } } : undefined
    const labelIds = labels?.node?.labels?.nodes.filter(label => labelNames.includes(label.name)).map(label => label.id) ?? []
    return this.graphqlResource(`mutation($repo: ID!, $title: String!, $body: String!, $labels: [ID!]) { createIssue(input: { repositoryId: $repo, title: $title, body: $body, labelIds: $labels }) { issue { id url } } }`, { repo: this.repositoryId, title, body, labels: labelIds }, 'createIssue.issue')
  }

  private async graphqlResource(query: string, variables: Record<string, unknown>, path: string, after?: (resource: GitHubResource) => void): Promise<GitHubResource> {
    let value = await this.graphqlRequest(query, variables) as Record<string, unknown>
    for (const part of path.split('.')) value = value[part] as Record<string, unknown>
    const resource = { id: String(value.id), url: typeof value.url === 'string' ? value.url : undefined }
    after?.(resource)
    return resource
  }

  private async refreshOwnerNodeId(): Promise<void> {
    try {
      const repository = await this.restRequest(`/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}`) as { owner?: { node_id?: string, type?: string } }
      if (repository.owner?.node_id) {
        this.ownerId = repository.owner.node_id
        this.ownerIsOrganization = repository.owner.type === 'Organization'
        return
      }
    }
    catch {
      // Fall back to GraphQL for installations whose REST response omits owner.node_id.
    }
    const data = await this.graphqlRequest(`query ResolveRepositoryOwner($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { owner { __typename id } } }`, { owner: this.owner, repo: this.repository }) as { repository?: { owner?: { __typename: 'User' | 'Organization', id: string } } | null }
    const owner = data.repository?.owner
    if (!owner?.id || /^\d+$/.test(owner.id))
      throw new Error(`Could not resolve the GraphQL owner node for '${this.owner}'`)
    this.ownerId = owner.id
    this.ownerIsOrganization = owner.__typename === 'Organization'
  }
}

export interface GitHubAdapter {
  reconcile: (action: PlanAction, reconciliationKey: string) => Promise<GitHubResource[]>
  execute: (action: PlanAction, reconciliationKey: string) => Promise<GitHubResource>
}

export interface PreflightReport { login: string, canReadRepository: boolean, canWriteRepository: boolean, canCreateRepository?: boolean, canUseProjects: boolean, rateLimitRemaining: number, rateLimitResetAt: string }
