# CODEX Prompt

## Context
- Repo: <repo>
- Branch: <branch>
- Date: <date>
- Project type: <projectType>

## Goal
Describe the desired outcome in one or two sentences.

## In Scope
- <item 1>
- <item 2>

## Out of Scope
- <item 1>
- <item 2>

## Constraints
- Do not modify files outside the repo.
- Do not change CI/CD or infra unless explicitly requested.
- Avoid adding new dependencies unless necessary and justified.
- Keep changes minimal and focused.
- <project-specific constraint>

## Acceptance Criteria
- <user-defined criterion>
- <user-defined criterion>
- Tests pass: <test command>
- Build succeeds: <build command>
- Lint clean: <lint command>

## Required Commands
- Test: <test command>
- Build: <build command>
- Lint: <lint command>

## Execution Rules
- Use the existing project conventions.
- Prefer small, verifiable changes.
- If you get stuck, document blockers and suggest next steps.

## Escape Hatch
If not complete by iteration <maxLoops>:
- Summarize what’s done
- List blockers
- Propose the next action

## Completion Signal (Exact Match)
PROMISE: true
EXIT_MESSAGE: "All parameters and tests have completed successfully"
