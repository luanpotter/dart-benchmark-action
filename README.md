# Dart Benchmark Action

![CI](https://github.com/luanpotter/dart-benchmark-action/actions/workflows/ci.yml/badge.svg)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action to run benchmarks on Dart/Flutter projects and libraries.

In order to use it, add to your GitHub repo:

```yaml
name: Benchmark

on: [push, pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: luanpotter/dart-benchmark-action@v1
      with:
        paths: "<path-to-your-dart-project>,<more>"
```


## Setup

To build:

```bash
  npm install
  npm run all
```