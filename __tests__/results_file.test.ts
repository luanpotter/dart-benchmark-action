import { Project } from '../src/action_context.js';
import { CommentFormatter } from '../src/comment_formatter.js';
import { BenchmarkResults, ResultMap } from '../src/result_map.js';
import {
	fromResultsFile,
	type ResultsFile,
	toResultsFile,
} from '../src/results_file.js';

describe('ResultsFile', () => {
	const named = new Project('packages/p1', 'p1');
	const unnamed = new Project('packages/p2', undefined);

	const results = new ResultMap();
	results.set(
		named,
		'head',
		BenchmarkResults.success(
			['T1(RunTime): 1.5 us.', 'T2(RunTime): 2.5 us.'].join('\n'),
		),
	);
	results.set(named, 'base', BenchmarkResults.success('T1(RunTime): 1.7 us.'));
	results.set(unnamed, 'head', BenchmarkResults.error());
	results.set(
		unnamed,
		'base',
		BenchmarkResults.success('T1(RunTime): 3.5 us.'),
	);

	it('holds the scores of both sides of each project, and the branch names', () => {
		const file = toResultsFile([named, unnamed], 'feature', 'main', results);

		expect(file).toEqual({
			version: 1,
			projects: [
				{ name: 'p1', head: { T1: 1.5, T2: 2.5 }, base: { T1: 1.7 } },
				{ name: 'packages/p2', head: {}, base: { T1: 3.5 } },
			],
			headBranch: 'feature',
			baseBranch: 'main',
		});
	});

	it('produces the same comment after going through JSON', () => {
		const file = toResultsFile([named, unnamed], 'feature', 'main', results);

		const parsed = JSON.parse(JSON.stringify(file)) as ResultsFile;
		const restored = fromResultsFile(parsed);

		expect(
			new CommentFormatter(
				restored.projects,
				parsed.headBranch,
				parsed.baseBranch,
				restored.results,
			).format(),
		).toBe(
			new CommentFormatter(
				[named, unnamed],
				'feature',
				'main',
				results,
			).format(),
		);
	});
});
