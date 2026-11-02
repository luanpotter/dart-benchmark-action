import * as core from '@actions/core';
import type { Project } from './action_context.js';

export const maxNameLength = 100;
export const reservedNames = new Set(['__proto__', 'constructor', 'prototype']);

export type BenchmarkDiff = {
	benchmark: string;
	headScore: number | undefined;
	baseScore: number | undefined;
	diff: number | undefined;
};

export class BenchmarkResults {
	// In the format: benchmark name to microseconds
	// (the benchmark_harness package always outputs in "us" (μs)
	private results: Record<string, number>;

	private constructor(results: Record<string, number>) {
		this.results = results;
	}

	// The output will be in the format:
	// Iteration Benchmark(RunTime): 155.3733089882978 us.
	// Other Benchmark(RunTime): 22.426620587035305 us.
	// Anything else is ignored. What this keeps is also what the reporter accepts, so
	// that one odd benchmark does not cost the comment for all the others.
	private static parseOutput(output: string): Record<string, number> {
		const results: Record<string, number> = {};
		for (const line of output.split('\n')) {
			const match = /^(.+)\(RunTime\): (\S+) us\.$/.exec(line.trim());
			if (!match) {
				continue;
			}

			const name = match[1].slice(0, maxNameLength);
			const value = Number(match[2]);
			if (reservedNames.has(name) || !Number.isFinite(value) || value < 0) {
				core.warning(`Ignoring unexpected benchmark: ${line.trim()}`);
				continue;
			}

			core.info(`Parsed benchmark: ${name} -> ${value}`);
			results[name] = value;
		}
		return results;
	}

	getScore(benchmark: string): number | undefined {
		return this.results[benchmark];
	}

	benchmarks(): string[] {
		return Object.keys(this.results);
	}

	scores(): Record<string, number> {
		return { ...this.results };
	}

	static success(output: string): BenchmarkResults {
		return new BenchmarkResults(BenchmarkResults.parseOutput(output.trim()));
	}

	static error(): BenchmarkResults {
		return new BenchmarkResults({});
	}

	static fromScores(scores: Record<string, number>): BenchmarkResults {
		return new BenchmarkResults({ ...scores });
	}

	static computeDiffs(
		head: BenchmarkResults,
		base: BenchmarkResults,
	): BenchmarkDiff[] {
		const allBenchmarks = [
			...new Set([...head.benchmarks(), ...base.benchmarks()]),
		];
		core.info(`Compiling diffs for benchmarks: ${allBenchmarks.join(', ')}`);
		return allBenchmarks.map(benchmark => {
			const headScore = head.getScore(benchmark);
			const baseScore = base.getScore(benchmark);

			let diff: number | undefined;
			if (headScore === undefined || baseScore === undefined) {
				diff = undefined;
			} else {
				diff = ((headScore - baseScore) / baseScore) * 100;
			}
			return {
				benchmark,
				headScore,
				baseScore,
				diff,
			};
		});
	}
}

// A side of the pull request. Branch names cannot tell these apart, as a fork
// can open a pull request from its `main` into the `main` of the base repository.
export type Side = 'head' | 'base';

export class ResultMap {
	private results = new Map<string, BenchmarkResults>();

	private static _toKey(project: Project, side: Side): string {
		return `${project.path}/${side}`;
	}

	set(project: Project, side: Side, value: BenchmarkResults): this {
		this.results.set(ResultMap._toKey(project, side), value);
		return this;
	}

	get(project: Project, side: Side): BenchmarkResults {
		return (
			this.results.get(ResultMap._toKey(project, side)) ??
			BenchmarkResults.error()
		);
	}

	computeDiffs(project: Project): BenchmarkDiff[] {
		return BenchmarkResults.computeDiffs(
			this.get(project, 'head'),
			this.get(project, 'base'),
		);
	}
}
