import { Project } from '../src/action_context.js';
import { CommentFormatter } from '../src/comment_formatter.js';
import { BenchmarkResults, ResultMap } from '../src/result_map.js';
import {
	formatResultsFile,
	parseResultsFile,
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

	it('produces the same comment after going through the file', () => {
		const file = toResultsFile([named, unnamed], 'feature', 'main', results);

		const parsed = parseResultsFile(JSON.stringify(file));

		expect(
			formatResultsFile({
				...parsed,
				headBranch: 'feature',
				baseBranch: 'main',
			}),
		).toBe(
			new CommentFormatter(
				[named, unnamed],
				'feature',
				'main',
				results,
			).format(),
		);
	});

	it('only keeps the expected fields, with safe names', () => {
		const parsed = parseResultsFile(
			JSON.stringify({
				version: 1,
				extra: 'ignored',
				headBranch: 'hostile',
				baseBranch: 'hostile',
				projects: [
					{
						name: '@everyone <img src=x> [link](http://evil)',
						extra: 'ignored',
						head: { 'a|b`c\n#1 www.evil.com': 1.5 },
						base: {},
					},
				],
			}),
		);

		expect(parsed).toEqual({
			version: 1,
			headBranch: '',
			baseBranch: '',
			projects: [
				{
					name: '_everyone _img src_x_ _link_(http_//evil)',
					head: { 'a_b_c__1 www_evil.com': 1.5 },
					base: {},
				},
			],
		});
	});

	const project = { name: 'p1', head: {}, base: {} };
	const manyBenchmarks = Object.fromEntries(
		Array.from({ length: 501 }, (_, i) => [`b${i}`, 1]),
	);

	it.each([
		['not JSON', '{'],
		['not an object', '[]'],
		['another version', JSON.stringify({ version: 2, projects: [] })],
		['no projects', JSON.stringify({ version: 1 })],
		[
			'a project of another type',
			JSON.stringify({ version: 1, projects: [1] }),
		],
		[
			'a name of another type',
			JSON.stringify({ version: 1, projects: [{ ...project, name: 1 }] }),
		],
		[
			'an empty name',
			JSON.stringify({ version: 1, projects: [{ ...project, name: '' }] }),
		],
		[
			'a long name',
			JSON.stringify({
				version: 1,
				projects: [{ ...project, name: 'a'.repeat(101) }],
			}),
		],
		[
			'scores of another type',
			JSON.stringify({ version: 1, projects: [{ ...project, head: [] }] }),
		],
		[
			'a score of another type',
			JSON.stringify({
				version: 1,
				projects: [{ ...project, head: { a: '1' } }],
			}),
		],
		[
			'a score that is not finite',
			'{"version":1,"projects":[{"name":"p1","base":{},"head":{"a":1e999}}]}',
		],
		[
			'a negative score',
			JSON.stringify({
				version: 1,
				projects: [{ ...project, head: { a: -1 } }],
			}),
		],
		[
			'a reserved benchmark name',
			'{"version":1,"projects":[{"name":"p1","base":{},"head":{"__proto__":1}}]}',
		],
		[
			'too many projects',
			JSON.stringify({ version: 1, projects: Array(51).fill(project) }),
		],
		[
			'too many benchmarks',
			JSON.stringify({
				version: 1,
				projects: [{ ...project, head: manyBenchmarks }],
			}),
		],
		['too much content', ' '.repeat(1_000_001)],
	])('rejects a file with %s', (_, contents) => {
		expect(() => parseResultsFile(contents)).toThrow();
	});
});
