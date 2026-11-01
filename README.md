# Dart Benchmark Action

![CI](https://github.com/luanpotter/dart-benchmark-action/actions/workflows/ci.yml/badge.svg)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action to run benchmarks on Dart/Flutter projects and libraries.

In order to use it, add it as an Action to your GitHub repository:

```yaml
name: Benchmark

on: [pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: dart-lang/setup-dart@v1
      - run: dart pub get

      - uses: luanpotter/dart-benchmark-action@v0.1.4
        with:
          paths: '<path-to-your-dart-project>,<more>'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This is what the comment can look like:

![image](https://github.com/user-attachments/assets/ab25e1d4-baaa-445e-9f51-ec82deb7d9a6)

But it will use tables and toggles depending on the amount of projects/packages
you have and the number of performance tests associated with them.

## Local Setup

To build, lint, and run tests locally, run:

```bash
  npm install
  npm run all
```

## Running Locally

You can run the action on your machine with
[`local-action`](https://github.com/github/local-action), using the inputs and
pull request described in `examples/local`:

```bash
  cp examples/local/.env.example .env
  npm run local-action
```

Do this in a throwaway clone, as the action really does run:

- `git fetch` and `git checkout` in your working tree, switching your branch.
- The benchmarks, using `dart` or `flutter` from your `PATH`.
- Requests to the real GitHub API. With a real token, repository and pull
  request number, it will post a real comment. The placeholder token in the
  example makes that step fail, and the run still finishes.
