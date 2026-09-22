# GitHub Project Kanban Generator Plan

## Purpose

Modernize the legacy GitHub Project creator into an interactive Bun, React, and OpenTUI application. The TUI creates an implementation-ready GitHub repository and Project v2 Kanban board for one selected fourth-semester frontend project option.

The fourth-semester project deliverables PDF is the requirements source for project options, six-week milestones, grading, and presentation checkpoints.

## Current Baseline

- `generate-project-kanban/` is the new Bun, React 19, and OpenTUI starter.
- `travel-log-github-project-creator/` contains reusable GitHub issue, label, Project v2, and Markdown-parsing logic.
- The new TUI replaces static Travel Log input with project-option templates.

## Agreed Product Decisions

- One run generates a board for one selected project option.
- Templates are built in and maintained as versioned YAML files.
- Epics represent functional project modules, not weekly milestones.
- Stories are assigned to Weeks 1 through 6 and linked to a functional epic.
- The TUI creates a new GitHub Project v2 board.
- The TUI supports personal GitHub accounts and organizations.
- The user can create a repository or select an existing one.
- New repositories default to private and invite `@Oluwasetemi` after confirmation.
- The user enters a GitHub token in a masked runtime prompt.
- The token is never persisted; resuming requires entering it again.
- The TUI displays a complete preview and requires confirmation before GitHub writes.
- A local, non-secret execution journal supports safe resumption without duplicate resources.
- Assessment cards are created for the Week 2, Week 4, and Week 6 presentations/final defense, weighted 10%, 15%, and 25%.

## Template Model

Each YAML template represents one project option from the fourth-semester PDF:

1. E-Commerce Admin and Real-Time Analytics Dashboard
2. Real-Time Kanban and Agile Project Management Board
3. Telemedicine and Virtual Care Patient Portal
4. LMS Student Learning and Assessment Portal
5. Multi-Tenant Content Publishing and CMS Platform

Every template must define:

- Project name, summary, and required technology stack.
- Functional-module epics.
- User stories with unique IDs, titles, descriptions, acceptance criteria, epic reference, week, and priority.
- The canonical Week 1 through Week 6 milestones, objectives, deliverables, evidence requirements, and weights listed below.
- Assessment cards for the Week 2, Week 4, and Week 6 presentations/final defense.
- Grade metadata matching the published 50% weekly-deliverables and 50% presentation structure.

Every template must use these canonical milestones from the fourth-semester deliverables PDF. Domain-specific stories may vary by project option, but they must satisfy the objective and evidence for their assigned week.

| Week | Milestone | Objectives and deliverables | Required evidence | Weight |
| --- | --- | --- | --- | ---: |
| 1 | Setup, Architecture and Type Definitions | Repository, ESLint, TypeScript strict mode, core domain interfaces, router, design tokens, and base layout shell | Repository link, merged setup PR, `tsc --noEmit` with no errors | 6% |
| 2 | Base Shell and Mock API Layer | Responsive shell/navigation, initial routes, MSW or mock data layer, and reusable atomic UI components | Navigation and mock-data recording; Storybook or component-preview link | 6% |
| 3 | Core Functionality and State Management | Global state, validated forms, and primary user workflows functioning end to end | PR for state logic and demo of form interaction plus cross-route state persistence | 6% |
| 4 | Advanced TypeScript and API Integration | Real or mock endpoint integration, generic/dynamic components, loading/error/empty states, and error boundaries | Code review showing generics and live offline/error-state demonstration | 6% |
| 5 | Testing, Optimization and Accessibility | Critical unit/integration tests, performance work, Lighthouse score of at least 85, and keyboard navigation | Vitest report or coverage export and Lighthouse audit PDF | 6% |
| 6 | Deployment, CI/CD and Final Defense | CI/CD deployment, final fixes, complete documentation, production launch, and presentation | Live URL, presentation delivery, and live codebase Q&A | 20% |

The assessment cards must be assigned to Week 2, Week 4, and Week 6 and carry 10%, 15%, and 25% respectively. Template validation must reject a template whose weekly and presentation weights do not total 50% each and 100% overall.

## GitHub Project Model

The generated Project v2 board must include these fields:

| Field | Type | Values |
| --- | --- | --- |
| Status | Built-in Project v2 single select | Todo, In Progress, Done |
| Week | Single select | Week 1, Week 2, Week 3, Week 4, Week 5, Week 6 |
| Epic | Single select | Functional epics from the selected template |
| Priority | Single select | P0, P1, P2, P3 |

The generator must create:

- Repository labels needed by the selected template.
- A new Project v2 board and the custom `Week`, `Epic`, and `Priority` fields.
- A lookup/configuration step for the built-in Project v2 `Status` field. It must not create a duplicate custom field named `Status`.
- One parent GitHub issue for each functional epic.
- One child GitHub issue for each story.
- One Project v2 item for every epic, story, and assessment card.
- Parent-child issue relationships between stories and epics.
- Field values for Status, Week, Epic, and Priority.

## TUI Workflow

1. Start a new setup or resume an incomplete execution.
2. Request a GitHub token in a masked input.
3. Validate the token, identity, ownership access, and GitHub Project permissions.
4. Select a personal account or organization.
5. Create a repository or select an existing repository.
6. Confirm repository privacy and invitation of `@Oluwasetemi` when creating a repository.
7. Select one project-option template.
8. Build and display the full creation plan.
9. Require an explicit confirmation before creating remote resources.
10. Create the repository when needed, then the Project v2 board, fields, labels, epics, stories, relationships, assessment cards, and Project values.
11. Persist progress after every completed remote operation.
12. Display repository URL, Project URL, creation summary, and journal location.

## Execution Journal And Recovery

The execution journal records only non-secret information:

- Schema version and creation-plan fingerprint.
- TUI answers other than the GitHub token.
- Selected owner, repository, and template identifiers.
- Planned actions and their completion states.
- GitHub resource IDs and URLs created by completed actions.
- Recoverable error messages and the next pending action.
- The durable action state: `pending`, `in-progress`, `completed`, or `failed`.
- A deterministic action key for every remote mutation.

The execution journal must not contain:

- GitHub tokens.
- Authorization headers.
- Raw request or response data that can expose credentials.

Before starting a remote mutation, the generator must durably mark the action as `in-progress` and store a deterministic reconciliation key derived from the plan fingerprint and action key. Put a searchable creation marker in GitHub-visible text where the resource supports it, such as generated issue bodies and the Project description. For resources without a text field, use these reconciliation keys instead:

- Repository: owner and repository name.
- Project: owner and creation marker in its description.
- Custom field: Project ID, field name, data type, and expected options.
- Label: repository ID and label name.
- Epic or story issue: repository ID and creation marker in the issue body.
- Parent-child relationship: parent issue ID and child issue ID.
- Project item: Project ID and content issue ID.
- Assessment card: Project ID, deterministic assessment-card title and marker, checkpoint week, and grade weight. The implementation must declare whether the card is an issue-backed Project item or a draft Project item and reconcile it using the matching GitHub resource type.
- Collaborator invitation: repository ID, invited login, and current collaborator or pending-invitation state.

On resume, the TUI requests the token again, revalidates access, loads the journal, and reconciles every `in-progress` or uncertain action against GitHub using its creation marker or resource-specific reconciliation key before retrying it. When a matching remote resource exists, record its ID and mark the action completed. When no matching resource exists, return the action to pending. When more than one candidate matches, stop and require the facilitator to resolve the ambiguity. The generator must never repeat an uncertain creation mutation without reconciliation.

## Implementation Phases

| Phase | Outcome | Exit gate |
| --- | --- | --- |
| 1. Domain design | Types for templates, plans, GitHub resources, and execution journals | Type design reviewed and all template invariants are expressible |
| 2. Template authoring | Five YAML project-option templates | Every template validates against the canonical milestones, evidence, and 50/50 grading structure |
| 3. Legacy migration and GitHub adapter | Inventory and port applicable legacy Octokit client, queries, mutations, labels, parent-child issue links, and Project-item operations into Bun-compatible services | Behavior-parity tests pass for ported operations; obsolete dotenv and static Markdown-input flows are excluded |
| 4. Planning engine | Deterministic conversion of a template and answers into an ordered action plan | Preview exactly matches planned actions |
| 5. TUI wizard | Keyboard-first setup, validation, preview, execution, and completion screens | Invalid input cannot advance; every interactive control has explicit focus; cancellation cleans up the renderer before writes |
| 6. Recovery | Durable journals, remote reconciliation, and idempotent resumption | Interrupted runs, including the gap after a successful mutation and before local persistence, resume without duplicate resources |
| 7. Verification | Automated, integration, and manual checks | All quality gates pass |
| 8. Release readiness | Usage, permission, recovery, and troubleshooting documentation | A facilitator can run the tool without reading source code |

## Validation System

### Template Validation

- Required fields are present and correctly typed.
- IDs are unique.
- Stories reference an existing epic.
- Week and priority values are valid.
- All six canonical weeks have planned work matching their published objectives, deliverables, and evidence requirements.
- Weekly deliverable weights equal 50%: 6%, 6%, 6%, 6%, 6%, and 20%.
- Presentation cards are assigned to Weeks 2, 4, and 6 with weights of 10%, 15%, and 25%, totaling 50%.
- The total project grade is 100%.

### GitHub Preflight Validation

- The token resolves to an authenticated user.
- The authenticated user can create or administer the selected personal or organization Project v2.
- The selected repository can be read and written, or the owner can create a repository.
- The token can create issues, labels, Project items, custom fields, and collaborator invitations required by the selected flow.
- GitHub rate limits leave sufficient capacity for the planned operations.
- The built-in Project v2 `Status` field exists and can be configured or verified with Todo, In Progress, and Done options.

### Execution Validation

- Each action is marked `in-progress` before its remote mutation and each API result is validated before the next dependent action begins.
- Every created resource is discoverable by its deterministic marker or resource-specific reconciliation key, and its ID is recorded in the journal.
- Every interrupted or uncertain action is reconciled against GitHub before it can be retried.
- Stories are linked to their expected parent epic.
- Project items have the intended Status, Week, Epic, and Priority values.
- Assessment cards contain the correct checkpoint and grade weight.

### Post-Run Validation

- Re-query GitHub and compare remote resources to the original creation plan.
- Verify repository privacy and collaborator invitation state.
- Verify the built-in `Status` field and the custom Week, Epic, and Priority field names and options.
- Verify epic, story, assessment-card, and Project-item counts.
- Report any mismatch with a concrete remediation action.

## Test Strategy

- Run TypeScript type checking for every change.
- Add linting and run it in local and CI validation.
- Add unit tests for template parsing, template validation, plan generation, journal persistence, and resume decisions.
- Use mocked GitHub clients to test legacy-operation parity, API action ordering, error handling, remote reconciliation, and idempotent resume behavior.
- Run TUI tests with Bun's test runner and OpenTUI React's `testRender` utility for all wizard screens and state transitions.
- Test that every input and select control has explicit focus when its screen becomes active, and that global shortcuts do not conflict with focused controls.
- Test cancellation, completion, and error exits to ensure they call `renderer.destroy()` and never `process.exit()`.
- Verify TypeScript keeps `jsx: "react-jsx"` and `jsxImportSource: "@opentui/react"`; OpenTUI code must run through Bun.
- Run a smoke test against a dedicated GitHub test account or organization before release.
- Manually test keyboard navigation, masked token input, cancellation, narrow-terminal layout, preview, intentional interruption, and resumption.

## Definition Of Done

- All five project options produce valid and distinct creation plans.
- A selected option creates one private repository and one GitHub Project v2 board when requested.
- Every generated story has a parent epic and Status, Week, Epic, and Priority field values.
- Assessment cards for Weeks 2, 4, and 6 carry 10%, 15%, and 25% weights.
- An intentionally interrupted execution resumes without duplicate GitHub resources.
- Tokens never appear in terminal output, logs, templates, or journal files.
- Type checking, linting, unit tests, dry-run validation, and test-account smoke testing pass.
