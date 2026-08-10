# @cairn/core

The domain of [Cairn](https://github.com/rochesebastien/cairn), a registry of
proven feature intentions: the stone schema (Zod), the frontmatter stone files,
the acceptance-criteria lint, the frozen status state machine, proof integrity
hashing, and the runs ledger. No I/O policy, no CLI — those live in
[`@cairn/cli`](https://www.npmjs.com/package/@cairn/cli), which this package
underpins.

A **stone** is one feature: a promise in the user's own words. A **proof** is
the deterministic Playwright spec that proves the promise is kept, replayed by
CI forever. Start with the
[project README](https://github.com/rochesebastien/cairn#readme).
