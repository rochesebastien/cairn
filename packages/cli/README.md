# @cairn/cli

The `cairn` command line for [Cairn](https://github.com/rochesebastien/cairn),
a registry of proven feature intentions committed next to your code.

```sh
pnpm add -D @cairn/cli
pnpm exec cairn init          # .cairn/{stones,proofs} + cairn.config.ts
```

Commands: `init`, `add`, `amend`, `list`, `show`, `status`, `metrics`,
`escalate`, `verify`. Every read command speaks `--json`; acceptance criteria
are linted to stay in user language (exit code `2` on refusal); `cairn verify
--all --proven-only` is the CI ratchet — no proven stone may regress. CI
templates to copy into your project ship under `templates/ci/`.

Full documentation:
[project README](https://github.com/rochesebastien/cairn#readme) and
[docs/](https://github.com/rochesebastien/cairn/tree/main/docs).
