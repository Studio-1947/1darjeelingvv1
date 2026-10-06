# Mobile provider dashboard port

## Goal
Make the Android provider dashboard use the same live booking metrics as the web provider dashboard.

## Tasks
- [x] Compare the web and Android provider dashboards. -> Verify: identify hard-coded mobile metrics as the main parity gap.
- [x] Refresh the provider inbox on dashboard entry and render its real stats. -> Verify: dashboard uses the provider inbox totals, confirmed count, pending requests, and revenue.
- [x] Validate the React Native app. -> Verify: TypeScript and all 16 Jest tests pass.

## Done When
- [x] Provider dashboard metrics no longer claim demo booking or revenue figures as live data.
