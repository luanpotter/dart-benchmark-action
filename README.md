# Dart Benchmark Action

![CI](https://github.com/luanpotter/dart-benchmark-action/actions/workflows/ci.yml/badge.svg)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action to run benchmarks on Dart/Flutter projects and libraries.

In order to use it, add these two workflows to your GitHub repository. The
action does the rest, including checking out your code and installing Dart.

```yaml
# .github/workflows/benchmark-runner.yml
name: Benchmark Runner
on: pull_request
permissions:
  contents: read
jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: luanpotter/dart-benchmark-action@v0.2.0
```

```yaml
# .github/workflows/benchmark-reporter.yml
name: Benchmark Reporter
on:
  workflow_run:
    workflows: [Benchmark Runner]
    types: [completed]
permissions:
  actions: read
  pull-requests: write
jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: luanpotter/dart-benchmark-action@v0.2.0
```

The runner runs the benchmarks with no write access, and the reporter comments
on the pull request without running any of its code. This way, pull requests
from forks get a comment too, and their code never receives any secrets or
tokens. GitHub requires two separate actions for this sandboxing, and only runs
the reporter once it is on your default branch. The `workflows:` line has to
match the name of the runner exactly. Without the reporter, results still show
in the summary of the run, with no comment.

The action fails on any other event. In particular, do not use
`pull_request_target`, which would run the code of the pull request with a token
that can write to your repository.

This is what the comment can look like:

![image](https://github.com/user-attachments/assets/ab25e1d4-baaa-445e-9f51-ec82deb7d9a6)

But it will use tables and toggles depending on the amount of projects/packages
you have and the number of performance tests associated with them.

## Custom Steps

All the options go on the runner, and are only needed if the defaults do not fit
your project. The reporter never takes any.

Set `paths` for a repository with several projects, or one that is not at the
root. It defaults to `.`.

Set `is-flutter: true` for a Flutter project.

Set `build-command` to provide any custom build steps, such as build runners.

Set `run-command` to replace the default `dart run` or `flutter test`, such as
to compile ahead of time. It must print `Name(RunTime): 1.23 us.` lines to
stdout.

Both commands run in each project path, for both the base and the PR. If either
fails, that branch is reported as having no results.

```yaml
- uses: luanpotter/dart-benchmark-action@v0.2.0
  with:
    paths: '<path-to-your-dart-project>,<more>'
    build-command: dart run build_runner build
    run-command:
      dart compile exe benchmark/main.dart -o /tmp/bench && /tmp/bench
```

## Custom Setup

The action only sets up what is not already there. To use a specific SDK
version, or to set up a monorepo, add your own steps before it on the runner. It
keeps an existing checkout, and any `dart`, `flutter` or Node.js 24+ on the
`PATH`.

```yaml
steps:
  - uses: actions/checkout@v7
    with:
      persist-credentials: false
  - uses: subosito/flutter-action@v2
    with:
      flutter-version: 3.24.0
  - run: |
      dart pub global activate melos
      melos bootstrap
  - uses: luanpotter/dart-benchmark-action@v0.2.0
    with:
      is-flutter: true
      paths: packages/flame,packages/flame_lint
```

These steps run once, on the code of the pull request. The base branch is
checked out afterwards, keeping anything they generated. If what they generate
depends on the branch, also set `build-command`, or the base branch will run
with the files of the pull request, and the results will be wrong without any
error.

Use `persist-credentials: false`, so that the token is not left in the Git
config for the code of the pull request to read. The exception is a private
repository, which needs the credentials to fetch the base branch.

Do not give the runner write permissions. Pull requests from forks are limited
to a read-only token anyway, but the code of any other pull request, including
its dependencies, could use them.

## Local Setup

To build, lint, and test locally, run:

```bash
  script/check.sh # --fix to fix
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

The results go to the file set in `INPUT_RESULTS_PATH`.
