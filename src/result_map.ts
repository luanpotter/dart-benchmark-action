import * as core from '@actions/core';
import type { Project } from './action_context.js';

export type BenchmarkDiff = {
	benchmark: string;
	scoreA: number | undefined;
	scoreB: number | undefined;
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
	private static parseOutput(output: string): Record<string, number> {
		const entries = output
			.trim()
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.match(/^.*\(RunTime\): .* us.$/));

		const results: Record<string, number> = {};
		for (const entry of entries) {
			try {
				const [p1, p2] = entry.split(': ');
				const name = p1.replace(/\(RunTime\)$/, '');
				const value = parseFloat(p2.replace(' us.', ''));
				core.info(`Parsed benchmark: ${name} -> ${value}`);
				results[name] = value;
			} catch {
				core.error(`Failed to parse benchmark output: \`${output}\``);
			}
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
		a: BenchmarkResults,
		b: BenchmarkResults,
	): BenchmarkDiff[] {
		const allBenchmarks = [...new Set([...a.benchmarks(), ...b.benchmarks()])];
		core.info(`Compiling diffs for benchmarks: ${allBenchmarks.join(', ')}`);
		return allBenchmarks.map(benchmark => {
			const scoreA = a.getScore(benchmark);
			const scoreB = b.getScore(benchmark);

			let diff: number | undefined;
			if (scoreA === undefined || scoreB === undefined) {
				diff = undefined;
			} else {
				diff = ((scoreA - scoreB) / scoreB) * 100;
			}
			return {
				benchmark,
				scoreA,
				scoreB,
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
		return `${project.identifier()}/${side}`;
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
