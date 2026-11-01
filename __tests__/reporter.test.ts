import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';

const getInput = jest.fn<(name: string) => string>();
const info = jest.fn<(message: string) => void>();
const error = jest.fn<(message: string) => void>();
const setFailed = jest.fn<(message: string) => void>();
jest.unstable_mockModule('@actions/core', () => ({
	getInput,
	info,
	error,
	setFailed,
}));

const mockExec = jest.fn<() => Promise<number>>();
jest.unstable_mockModule('@actions/exec', () => ({ exec: mockExec }));

const getOctokit = jest.fn<(token: string) => unknown>();
const context = {
	eventName: 'workflow_run',
	payload: {} as Record<string, unknown>,
	repo: { owner: 'owner', repo: 'repo' },
};
jest.unstable_mockModule('@actions/github', () => ({ getOctokit, context }));

const { run } = await import('../src/main.js');

const marker = '<!-- dart-benchmark-action -->';
const expectedBody = [
	marker,
	'## Benchmark Results',
	'',
	'### Package <b>p1</b>:',
	'',
	' * Current Branch [feature]: 100.456 μs',
	' * Base Branch [main]: 100.123 μs',
	' * Diff: 🔴 +0.333 %',
	'',
	'---',
	'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
	'',
].join('\n');

describe('reporting on workflow_run', () => {
	let directory: string;
	let resultsPath: string;

	const listPulls = jest.fn<(params: object) => Promise<unknown>>();
	const paginate = jest.fn<(...params: unknown[]) => Promise<unknown>>();
	const listComments = jest.fn();
	const createComment = jest.fn<(params: object) => Promise<unknown>>();
	const updateComment = jest.fn<(params: object) => Promise<unknown>>();

	beforeEach(async () => {
		jest.resetAllMocks();
		delete process.env.GITHUB_TOKEN;

		directory = await mkdtemp(join(tmpdir(), 'dart-benchmark-action-'));
		resultsPath = join(directory, 'results.json');

		// any other input, such as the commands, throws: this must not read them
		getInput.mockImplementation(name => {
			if (name === 'results_path') return resultsPath;
			if (name === 'github_token') return 'write-token';
			throw new Error(`Unexpected input: ${name}`);
		});

		context.eventName = 'workflow_run';
		context.payload = {
			workflow_run: {
				event: 'pull_request',
				conclusion: 'success',
				head_sha: 'abc',
				head_branch: 'feature',
				head_repository: { owner: { login: 'forker' } },
			},
		};

		listPulls.mockResolvedValue({
			data: [
				{
					number: 7,
					head: { sha: 'abc', ref: 'feature' },
					base: { ref: 'main' },
				},
			],
		});
		paginate.mockResolvedValue([]);
		getOctokit.mockReturnValue({
			paginate,
			rest: {
				pulls: { list: listPulls },
				issues: { listComments, createComment, updateComment },
			},
		});
	});

	afterEach(async () => {
		await rm(directory, { recursive: true });
	});

	async function writeResults(results: object = validResults()): Promise<void> {
		await writeFile(resultsPath, JSON.stringify(results));
	}

	function validResults(): object {
		return {
			version: 1,
			projects: [
				{
					name: 'p1',
					head: { Template: 100.456 },
					base: { Template: 100.123 },
				},
			],
			headBranch: 'hostile-head',
			baseBranch: 'hostile-base',
		};
	}

	it('should comment on the pull request found on GitHub, with its branch names', async () => {
		await writeResults();

		await run();

		expect(getOctokit).toHaveBeenCalledWith('write-token');
		expect(listPulls).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			state: 'open',
			head: 'forker:feature',
		});
		expect(createComment).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			issue_number: 7,
			body: expectedBody,
		});
		expect(mockExec).not.toHaveBeenCalled();
		expect(setFailed).not.toHaveBeenCalled();
	});

	it('should update its own comment, and no other', async () => {
		await writeResults();
		paginate.mockResolvedValue([
			{
				id: 1,
				user: { login: 'attacker' },
				body: `${marker}\n## Benchmark Results`,
			},
			{
				id: 2,
				user: { login: 'github-actions[bot]' },
				body: '## Benchmark Results, without the marker',
			},
			{
				id: 3,
				user: { login: 'github-actions[bot]' },
				body: `${marker}\nOld results`,
			},
		]);

		await run();

		expect(updateComment).toHaveBeenCalledTimes(1);
		expect(updateComment).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			comment_id: 3,
			body: expectedBody,
		});
		expect(createComment).not.toHaveBeenCalled();
	});

	it('should keep hostile names from forming markdown, links or mentions', async () => {
		await writeResults({
			version: 1,
			projects: [
				{
					name: '@everyone [link](http://evil)',
					head: { '<img src=x>|': 1 },
					base: { '<img src=x>|': 2 },
				},
			],
		});
		listPulls.mockResolvedValue({
			data: [
				{
					number: 7,
					head: { sha: 'abc', ref: '<b>@team' },
					base: { ref: 'main' },
				},
			],
		});

		await run();

		const { body } = createComment.mock.calls[0][0] as { body: string };
		expect(body).toContain('_everyone _link_(http_//evil)');
		expect(body).toContain('Current Branch [_b__team]');
		expect(body).not.toMatch(/@|<img|\[link\]|http:/);
	});

	it('should fail without commenting on an invalid file', async () => {
		await writeResults({ version: 1, projects: [{ name: 'p1' }] });

		await run();

		expect(setFailed).toHaveBeenCalledWith(
			'Invalid results file: unexpected scores.',
		);
		expect(createComment).not.toHaveBeenCalled();
		expect(getOctokit).not.toHaveBeenCalled();
	});

	it.each([
		['a run that failed', { conclusion: 'failure' }],
		['a run that was not for a pull request', { event: 'workflow_run' }],
	])('should do nothing for %s', async (_, changes) => {
		await writeResults();
		context.payload = {
			workflow_run: {
				...(context.payload.workflow_run as object),
				...changes,
			},
		};

		await run();

		expect(getOctokit).not.toHaveBeenCalled();
		expect(setFailed).not.toHaveBeenCalled();
	});

	it('should do nothing when the run has no results', async () => {
		await run();

		expect(getOctokit).not.toHaveBeenCalled();
		expect(setFailed).not.toHaveBeenCalled();
	});

	it('should not comment on a pull request at another commit', async () => {
		await writeResults();
		listPulls.mockResolvedValue({
			data: [
				{
					number: 7,
					head: { sha: 'other', ref: 'feature' },
					base: { ref: 'main' },
				},
			],
		});

		await run();

		expect(createComment).not.toHaveBeenCalled();
		expect(setFailed).not.toHaveBeenCalled();
	});

	it('should not fail when commenting does', async () => {
		await writeResults();
		createComment.mockRejectedValue(new Error('Forbidden'));

		await run();

		expect(error).toHaveBeenCalledWith(
			'+ Failed to create or update comment on GitHub.: Forbidden',
		);
		expect(setFailed).not.toHaveBeenCalled();
	});
});
