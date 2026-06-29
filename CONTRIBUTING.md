# Contributing to OKF Hub

Thanks for your interest! OKF Hub is in its **early design-to-implementation
phase**, so feedback on the design is as valuable as code right now.

## Ways to contribute

- **Discuss the design.** Read
  [`docs/superpowers/specs/2026-06-29-okf-hub-design.md`](docs/superpowers/specs/2026-06-29-okf-hub-design.md)
  and open an issue with questions, concerns, or suggestions.
- **Report bugs / request features.** Open an issue describing the problem, what
  you expected, and (for bugs) how to reproduce.
- **Submit code.** See the workflow below.

## Development workflow

> Tooling is being set up as implementation begins; this section will be expanded
> with concrete `install` / `dev` / `test` commands once the app is scaffolded.

1. Fork and clone the repo.
2. Create a feature branch from `main`.
3. Make your change. Keep modules focused and well-bounded (see the spec's module
   boundaries — `okf-core` stays pure and I/O-free).
4. Add or update tests. `okf-core` logic is developed test-first.
5. Ensure lint, tests, and `okf-validate` pass.
6. Open a pull request describing **what** changed and **why**.

## Principles

- **Git is the source of truth.** Never introduce state that can't be rebuilt from
  the OKF repo.
- **Validate in one place.** Validation rules live in `okf-core` and are reused by
  both the editor and CI — don't duplicate them.
- **Small, reviewable PRs.** Prefer focused changes over large refactors.

## Code of Conduct

Be respectful and constructive. Harassment or abuse of any kind is not tolerated.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
