import { CommentFormatter } from '../src/comment_formatter.js';
import { BenchmarkResults, ResultMap } from '../src/result_map.js';
import { Project } from '../src/action_context.js';

describe('CommentFormatter', () => {
	it('single project, single diff, success', () => {
		const project = new Project('.', 'my-project');

		const results = new ResultMap();
		results.set(
			project,
			'head',
			BenchmarkResults.success(
				'Iteration Benchmark(RunTime): 146.1234445775 us.',
			),
		);
		results.set(
			project,
			'base',
			BenchmarkResults.success(
				'Iteration Benchmark(RunTime): 155.3733089882978 us.',
			),
		);

		const commentFormatter = new CommentFormatter(
			[project],
			'feature',
			'main',
			results,
		);

		const result = commentFormatter.format();

		const expected = [
			'## Benchmark Results',
			'',
			'### Package <b>my-project</b>:',
			'',
			' * Current Branch [feature]: 146.123 μs',
			' * Base Branch [main]: 155.373 μs',
			' * Diff: 🟢 -5.953 %',
			'',
			'---',
			'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
			'',
		];

		expect(result).toBe(expected.join('\n'));
	});

	it('both branches with the same name, single diff, success', () => {
		const project = new Project('.', 'my-project');

		const results = new ResultMap();
		results.set(
			project,
			'head',
			BenchmarkResults.success('Template(RunTime): 100.456 us.'),
		);
		results.set(
			project,
			'base',
			BenchmarkResults.success('Template(RunTime): 100.123 us.'),
		);

		const commentFormatter = new CommentFormatter(
			[project],
			'main',
			'main',
			results,
		);

		const result = commentFormatter.format();

		const expected = [
			'## Benchmark Results',
			'',
			'### Package <b>my-project</b>:',
			'',
			' * Current Branch [main]: 100.456 μs',
			' * Base Branch [main]: 100.123 μs',
			' * Diff: 🔴 +0.333 %',
			'',
			'---',
			'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
			'',
		];

		expect(result).toBe(expected.join('\n'));
	});

	it('multiple projects, single diff, success', () => {
		const p1 = new Project('packages/p1', 'p1');
		const p2 = new Project('packages/p2', 'p2');

		const results = new ResultMap();
		results.set(
			p1,
			'head',
			BenchmarkResults.success('Template(RunTime): 100.456 us.'),
		);
		results.set(
			p1,
			'base',
			BenchmarkResults.success('Template(RunTime): 100.123 us.'),
		);
		results.set(
			p2,
			'head',
			BenchmarkResults.success('Template(RunTime): 200.123 us.'),
		);
		results.set(
			p2,
			'base',
			BenchmarkResults.success('Template(RunTime): 200.456 us.'),
		);

		const commentFormatter = new CommentFormatter(
			[p1, p2],
			'feature',
			'main',
			results,
		);

		const result = commentFormatter.format();

		const expected = [
			'## Benchmark Results',
			'',
			'<details>',
			'<summary><h3>Package <b>p1</b>: 🔴 +0.333 %</h3></summary>',
			' * Current Branch [feature]: 100.456 μs',
			' * Base Branch [main]: 100.123 μs',
			' * Diff: 🔴 +0.333 %',
			'</details>',
			'',
			'<details>',
			'<summary><h3>Package <b>p2</b>: 🟢 -0.166 %</h3></summary>',
			' * Current Branch [feature]: 200.123 μs',
			' * Base Branch [main]: 200.456 μs',
			' * Diff: 🟢 -0.166 %',
			'</details>',
			'',
			'---',
			'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
			'',
		];

		expect(result).toBe(expected.join('\n'));
	});

	it('single project, multiple diffs, success', () => {
		const project = new Project('.', 'my-project');

		const results = new ResultMap();
		results.set(
			project,
			'head',
			BenchmarkResults.success(
				[
					'Iteration Benchmark(RunTime): 146.1234445775 us.',
					'Other Benchmark(RunTime): 146.1234445775 us.',
				].join('\n'),
			),
		);
		results.set(
			project,
			'base',
			BenchmarkResults.success(
				[
					'Iteration Benchmark(RunTime): 155.3733089882978 us.',
					'Other Benchmark(RunTime): 155.3733089882978 us.',
				].join('\n'),
			),
		);

		const commentFormatter = new CommentFormatter(
			[project],
			'feature',
			'main',
			results,
		);

		const result = commentFormatter.format();

		const expected = [
			'## Benchmark Results',
			'',
			'### Package <b>my-project</b>:',
			'',
			'| Benchmarks | Current Branch<br/>[feature] | Base Branch<br/>[main] | Diff |',
			'| ------------- | -------- | -------- | -------- |',
			'| Iteration Benchmark | 146.123 μs | 155.373 μs | 🟢 -5.953 % |',
			'| Other Benchmark | 146.123 μs | 155.373 μs | 🟢 -5.953 % |',
			'',
			'---',
			'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
			'',
		];

		expect(result).toBe(expected.join('\n'));
	});

	it('multiple projects, multiple diffs, success', () => {
		const p1 = new Project('packages/p1', 'p1');
		const p2 = new Project('packages/p2', 'p2');

		const results = new ResultMap();
		results.set(
			p1,
			'head',
			BenchmarkResults.success(
				['Template(RunTime): 100.456 us.', 'Other(RunTime): 100.456 us.'].join(
					'\n',
				),
			),
		);
		results.set(
			p1,
			'base',
			BenchmarkResults.success(
				['Template(RunTime): 100.123 us.', 'Other(RunTime): 100.123 us.'].join(
					'\n',
				),
			),
		);
		results.set(
			p2,
			'head',
			BenchmarkResults.success(
				['Template(RunTime): 200.123 us.', 'Other(RunTime): 200.123 us.'].join(
					'\n',
				),
			),
		);
		results.set(
			p2,
			'base',
			BenchmarkResults.success(
				['Template(RunTime): 200.456 us.', 'Other(RunTime): 200.456 us.'].join(
					'\n',
				),
			),
		);

		const commentFormatter = new CommentFormatter(
			[p1, p2],
			'feature',
			'main',
			results,
		);

		const result = commentFormatter.format();

		const expected = [
			'## Benchmark Results',
			'',
			'<details>',
			'<summary><h3>Package <b>p1</b>: 🔴 +0.333 %</h3></summary>',
			'| Benchmarks | Current Branch<br/>[feature] | Base Branch<br/>[main] | Diff |',
			'| ------------- | -------- | -------- | -------- |',
			'| Template | 100.456 μs | 100.123 μs | 🔴 +0.333 % |',
			'| Other | 100.456 μs | 100.123 μs | 🔴 +0.333 % |',
			'</details>',
			'',
			'<details>',
			'<summary><h3>Package <b>p2</b>: 🟢 -0.166 %</h3></summary>',
			'| Benchmarks | Current Branch<br/>[feature] | Base Branch<br/>[main] | Diff |',
			'| ------------- | -------- | -------- | -------- |',
			'| Template | 200.123 μs | 200.456 μs | 🟢 -0.166 % |',
			'| Other | 200.123 μs | 200.456 μs | 🟢 -0.166 % |',
			'</details>',
			'',
			'---',
			'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
			'',
		];

		expect(result).toBe(expected.join('\n'));
	});

	it('single project, error diff', () => {
		const project = new Project('.', 'my-project');

		const results = new ResultMap();
		results.set(project, 'head', BenchmarkResults.error());
		results.set(project, 'base', BenchmarkResults.error());

		const commentFormatter = new CommentFormatter(
			[project],
			'feature',
			'main',
			results,
		);

		const result = commentFormatter.format();

		const expected = [
			'## Benchmark Results',
			'',
			'> [!WARNING]',
			'No benchmark results found for package my-project.',
			'',
			'---',
			'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
			'',
		];

		expect(result).toBe(expected.join('\n'));
	});
});
