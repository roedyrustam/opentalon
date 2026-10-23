## Summary / Ringkasan Perubahan

<!-- Describe what this PR implements, fixes, or optimizes / Jelaskan apa yang diimplementasikan atau diperbaiki oleh PR ini -->

- **Related Issue**: Closes #
- **Affected Packages**:
  - [ ] `@opentalon/core`
  - [ ] `@opentalon/memory`
  - [ ] `@opentalon/skill-engine`
  - [ ] `@opentalon/gateway`
  - [ ] `talon` (CLI)
  - [ ] Documentation / CI

## Quality & Anti-Slop Checklist / Daftar Periksa Kualitas

- [ ] **100% Complete Implementation**: No `// TODO`, `// ...`, or mock placeholders in production paths.
- [ ] **Typecheck Clean**: `pnpm run typecheck` passes with `0` errors across all packages.
- [ ] **Tests Passing**: `pnpm test` passes all existing and newly added unit tests.
- [ ] **Zero-Trust Safe**: Any new skill or execution path respects `SecurityGate` and `SandboxedVmRunner`.
- [ ] **Documentation Updated**: Updated `README.md` or `CHANGELOG.md` if public APIs or CLI commands changed.
