import * as core from '@actions/core';
import { Project } from './action_context';

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

	private constructor(output: string | undefined) {
		if (output === undefined) {
			this.results = {};
		} else {
			this.results = BenchmarkResults.parseOutput(output);
		}
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

	static success(output: string): BenchmarkResults {
		return new BenchmarkResults(output.trim());
	}

	static error(): BenchmarkResults {
		return new BenchmarkResults(undefined);
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

export class ResultMap {
	private results = new Map<string, BenchmarkResults>();

	private static _toKey(project: Project, branch: string): string {
		return `${project.identifier()}/${branch}`;
	}

	set(project: Project, branch: string, value: BenchmarkResults): this {
		this.results.set(ResultMap._toKey(project, branch), value);
		return this;
	}

	get(project: Project, branch: string): BenchmarkResults {
		return (
			this.results.get(ResultMap._toKey(project, branch)) ??
			BenchmarkResults.error()
		);
	}

	computeDiffs(
		project: Project,
		branchA: string,
		branchB: string,
	): BenchmarkDiff[] {
		const a = this.get(project, branchA);
		const b = this.get(project, branchB);
		return BenchmarkResults.computeDiffs(a, b);
	}
}
