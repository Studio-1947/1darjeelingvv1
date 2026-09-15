# 1Darjeeling test and CI reliability

## Goal
Make the non-Elegant-Sip applications reproducibly verifiable locally and on every pull request.

## Tasks
- [x] Make backend test setup fail quickly with actionable PostgreSQL guidance -> Verified against an unavailable port.
- [x] Make `npm test` provision/migrate its test database before executing -> Verified with the local PostgreSQL container.
- [x] Add public-frontend test tooling for the existing test files -> 37 tests execute under Vitest.
- [x] Add CI for backend, public web, admin, and mobile on normal branches -> Workflow YAML validated and commands run locally.
- [x] Remove stale test-count and implementation claims from current project documentation -> Docs match executed suites.
- [x] Run typechecks, builds, tests, lint where configured, and high-severity dependency audits.

## Done When
- [x] A contributor and CI can obtain a trustworthy pass/fail result without undocumented setup.

## Notes
- Elegant Sip is explicitly out of scope.
- Do not commit or push without user approval.
- Dependency audits found follow-up remediation work: 3 backend high-severity advisories, 2 admin advisories, 6 mobile advisories, and a large legacy frontend tree dominated by unused `react-scripts`.
