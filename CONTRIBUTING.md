# Contributing to OpenTalon 🦅

First off, thank you for considering contributing to **OpenTalon**! Whether you are fixing a bug, authoring a new sandboxed `SKILL.md`, adding an LLM provider adapter, or improving documentation, your contributions are warmly welcomed.

[English](#english) | [Bahasa Indonesia](#bahasa-indonesia)

---

<a name="english"></a>
## 🇬🇧 English Guide

### 1. Local Development Setup (60 Seconds)

OpenTalon is a zero-bloat TypeScript monorepo managed with `pnpm` workspaces.

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/opentalon.git
cd opentalon

# 2. Install dependencies (Node.js 22+ and pnpm 9+ required)
pnpm install

# 3. Build all packages
pnpm build

# 4. Run strict TypeScript typechecking & Vitest test suite
pnpm typecheck
pnpm test
```

### 2. How to Contribute a New Procedural Skill (`SKILL.md`)

One of the easiest and most valuable ways to contribute is adding a new verified skill to [`examples/skills/`](examples/skills/)!

Every skill is a single Markdown file with YAML frontmatter, an isolated JavaScript function (`export default async function run(args)`), and deterministic JSON test cases:

```markdown
---
id: skill_my_new_utility
name: my_new_utility
description: Concise description of what this skill computes or transforms
version: 1.0.0
capabilities:
  net:
    allowedHosts: []
    allowHttp: false
  fs:
    readPaths: []
    writePaths: []
  env: []
---

# My New Utility Skill

\`\`\`javascript
export default async function run(args) {
  const input = String(args.text || '');
  return {
    length: input.length,
    upper: input.toUpperCase(),
  };
}
\`\`\`

\`\`\`json
[
  {
    "args": { "text": "talon" },
    "expected": { "length": 5, "upper": "TALON" }
  }
]
\`\`\`
```

Test your skill locally using the CLI:
```bash
pnpm talon skills add examples/skills/my-new-utility.md
pnpm talon skills test my_new_utility --args '{"text":"hello"}'
```

### 3. How to Add a New LLM Provider Driver

OpenTalon uses a clean **Hexagonal `ILLMPort`** interface in [`packages/core/src/types.ts`](packages/core/src/types.ts). To add a new LLM provider (e.g., Mistral, Groq, Cohere, Bedrock):
1. Create `packages/core/src/drivers/<provider>-driver.ts` implementing `ILLMPort` (`generateContent`, `createEmbedding`, and optional `streamContent`).
2. Export the driver in [`packages/core/src/index.ts`](packages/core/src/index.ts).
3. Add unit tests in `packages/core/src/__tests__/` using mocked `fetch` responses (no live API keys required in CI).

### 4. Engineering & Quality Standards (Anti-Slop Policy)
- **Zero Placeholders**: Never submit code containing `// TODO`, `// ...`, or unimplemented stubs.
- **100% Type Safety**: `pnpm typecheck` (`tsc --noEmit`) must pass with 0 errors across all 5 packages.
- **Test Coverage**: Every new feature or bugfix must include unit tests in `__tests__/`. Run `pnpm test` before opening a Pull Request.
- **Conventional Commits**: Use clear commit prefixes such as `feat(core): ...`, `fix(sandbox): ...`, `docs(readme): ...`, or `test(gateway): ...`.

---

<a name="bahasa-indonesia"></a>
## 🇮🇩 Panduan Kontribusi (Bahasa Indonesia)

Terima kasih atas minat Anda untuk berkontribusi pada **OpenTalon**! Proyek ini terbuka untuk seluruh pengembang di Indonesia maupun global.

### Cara Cepat Mulai Berkontribusi:
1. **Fork & Clone** repositori ini ke komputer lokal Anda.
2. Jalankan `pnpm install && pnpm build && pnpm test` untuk memastikan seluruh **123 unit test** berjalan hijau.
3. Buat branch fitur baru: `git checkout -b feat/nama-fitur-anda`.
4. Area kontribusi yang sangat direkomendasikan untuk pemula (*Good First Issues*):
   - **Menambah Koleksi Skill Baru (`examples/skills/`)**: Buat skill prosedural baru yang berjalan di dalam Zero-Trust Sandbox.
   - **Menambah Adapter LLM Baru (`packages/core/src/drivers/`)**: Integrasikan provider AI baru melalui kontrak `ILLMPort`.
   - **Konektor Webhook & Bot (`packages/gateway/`)**: Tambahkan contoh integrasi webhook untuk Telegram, Discord, WhatsApp, atau GitHub Actions.
5. Pastikan `pnpm build`, `pnpm typecheck`, dan `pnpm test` lulus 100% sebelum mengirim **Pull Request (PR)**.
