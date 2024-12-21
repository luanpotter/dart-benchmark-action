import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import { run } from '../src/main';

jest.mock('@actions/exec');
jest.mock('@actions/core');
jest.mock('@actions/github');

Object.defineProperty(github.context, 'repo', {
	get: () => ({
		owner: 'owner',
		repo: 'repo',
	}),
});

describe('run', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		(core.getInput as jest.Mock).mockImplementation(
			() => 'repo1/benchmarks,repo2/benchmarks',
		);

		github.context.payload = {
			pull_request: {
				number: 123,
				head: { ref: 'feature-branch' },
				base: { ref: 'main' },
			},
		};

		process.env.GITHUB_TOKEN = 'fake-token';
	});

	it('should fetch inputs and execute benchmarks on both branches', async () => {
		const mockExec = exec.exec as jest.Mock;

		mockExec
			.mockResolvedValueOnce('Benchmark results for feature branch')
			.mockResolvedValueOnce('Benchmark results for main branch');

		const mockComments = jest.fn().mockResolvedValueOnce({ data: [] });
		const mockCreateComment = jest.fn();
		const mockUpdateComment = jest.fn();

		(github.getOctokit as jest.Mock).mockReturnValue({
			rest: {
				issues: {
					listComments: mockComments,
					createComment: mockCreateComment,
					updateComment: mockUpdateComment,
				},
			},
		});

		await run();

		expect(mockExec).toHaveBeenCalledWith(
			'dart',
			['run', 'repo1/benchmarks/benchmark/main.dart'],
			expect.anything(),
		);
		expect(mockExec).toHaveBeenCalledWith(
			'dart',
			['run', 'repo2/benchmarks/benchmark/main.dart'],
			expect.anything(),
		);

		expect(mockComments).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			issue_number: 123,
		});

		expect(mockCreateComment).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			issue_number: 123,
			body: expect.stringContaining('### Benchmark Results') as string,
		});
	});

	it('should update an existing comment if present', async () => {
		const mockExec = exec.exec as jest.Mock;

		const existingComment = {
			id: 1,
			body: '### Benchmark Results\nOld results',
		};
		const mockComments = jest
			.fn()
			.mockResolvedValueOnce({ data: [existingComment] });
		const mockUpdateComment = jest.fn();

		(github.getOctokit as jest.Mock).mockReturnValue({
			rest: {
				issues: {
					listComments: mockComments,
					updateComment: mockUpdateComment,
				},
			},
		});

		mockExec
			.mockResolvedValueOnce('Updated feature branch results')
			.mockResolvedValueOnce('Updated main branch results');

		await run();

		expect(mockUpdateComment).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			comment_id: 1,
			body: expect.stringContaining('### Benchmark Results') as string,
		});
	});

	it('should fail if no pull request context is available', async () => {
		github.context.payload = {};

		await run();

		expect(core.setFailed).toHaveBeenCalledWith(
			'This action only works on pull request events.',
		);
	});

	it('should handle benchmark execution errors gracefully', async () => {
		const mockExec = exec.exec as jest.Mock;
		mockExec.mockRejectedValue(new Error('Execution failed'));

		await expect(run()).resolves.not.toThrow();

		expect(core.error).toHaveBeenCalledWith(
			'Failed to run benchmark on current branch for repo1/benchmarks: Execution failed',
		);
	});
});
