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

## Local Setup

To build, lint, and run tests locally, run:

```bash
  npm install
  npm run all
```
