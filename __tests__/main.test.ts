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
			() => 'packages/p1,packages/p2',
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
		const mockExec = mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});

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
			['run', 'packages/p1/benchmark/main.dart'],
			expect.anything(),
		);
		expect(mockExec).toHaveBeenCalledWith(
			'dart',
			['run', 'packages/p2/benchmark/main.dart'],
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
			body: [
				'## Benchmark Results',
				'',
				'<details>',
				'<summary><h3>Package <b>p1</b>: 🔴 +0.333 %</h3></summary>',
				' * Current Branch [feature-branch]: 100.456 μs',
				' * Base Branch [main]: 100.123 μs',
				' * Diff: 🔴 +0.333 %',
				'</details>',
				'',
				'<details>',
				'<summary><h3>Package <b>p2</b>: 🔴 -0.166 %</h3></summary>',
				' * Current Branch [feature-branch]: 200.123 μs',
				' * Base Branch [main]: 200.456 μs',
				' * Diff: 🔴 -0.166 %',
				'</details>',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)_',
				'',
			].join('\n'),
		});
	});

	it('should handle package name resolution failure gracefully', async () => {
		const mockExec = mockCommandOutputs(
			{
				'main/p1': 'Template(RunTime): 100.123 us.',
				'main/p2': 'Template(RunTime): 200.456 us.',
				'feature-branch/p1': 'Template(RunTime): 100.456 us.',
				'feature-branch/p2': 'Template(RunTime): 200.123 us.',
			},
			{
				failPackageNameResolution: true,
			},
		);

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
			['run', 'packages/p1/benchmark/main.dart'],
			expect.anything(),
		);
		expect(mockExec).toHaveBeenCalledWith(
			'dart',
			['run', 'packages/p2/benchmark/main.dart'],
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
			body: [
				'## Benchmark Results',
				'',
				'<details>',
				'<summary><h3>Package <b>packages/p1</b>: 🔴 +0.333 %</h3></summary>',
				' * Current Branch [feature-branch]: 100.456 μs',
				' * Base Branch [main]: 100.123 μs',
				' * Diff: 🔴 +0.333 %',
				'</details>',
				'',
				'<details>',
				'<summary><h3>Package <b>packages/p2</b>: 🔴 -0.166 %</h3></summary>',
				' * Current Branch [feature-branch]: 200.123 μs',
				' * Base Branch [main]: 200.456 μs',
				' * Diff: 🔴 -0.166 %',
				'</details>',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)_',
				'',
			].join('\n'),
		});
	});

	it('should update an existing comment if present', async () => {
		const mockExec = mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});

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

		await run();

		expect(mockExec).toHaveBeenCalledWith(
			'dart',
			['run', 'packages/p1/benchmark/main.dart'],
			expect.anything(),
		);
		expect(mockExec).toHaveBeenCalledWith(
			'dart',
			['run', 'packages/p2/benchmark/main.dart'],
			expect.anything(),
		);

		expect(mockUpdateComment).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			comment_id: 1,
			body: [
				'## Benchmark Results',
				'',
				'<details>',
				'<summary><h3>Package <b>p1</b>: 🔴 +0.333 %</h3></summary>',
				' * Current Branch [feature-branch]: 100.456 μs',
				' * Base Branch [main]: 100.123 μs',
				' * Diff: 🔴 +0.333 %',
				'</details>',
				'',
				'<details>',
				'<summary><h3>Package <b>p2</b>: 🔴 -0.166 %</h3></summary>',
				' * Current Branch [feature-branch]: 200.123 μs',
				' * Base Branch [main]: 200.456 μs',
				' * Diff: 🔴 -0.166 %',
				'</details>',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)_',
				'',
			].join('\n'),
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
			'+ Failed to run benchmark for packages/p1 on branch feature-branch: Execution failed',
		);
		expect(core.error).toHaveBeenCalledWith(
			'+ Failed to run benchmark for packages/p2 on branch feature-branch: Execution failed',
		);
		expect(core.setFailed).toHaveBeenCalled();
	});

	function mockCommandOutputs(
		results: Record<string, string>,
		options: {
			failPackageNameResolution: boolean;
		} = {
			failPackageNameResolution: false,
		},
	): jest.Mock {
		const mockExec = exec.exec as jest.Mock;
		const { failPackageNameResolution } = options;

		let isMain = false;
		mockExec.mockImplementation(
			async (
				command,
				args: string[],
				options: {
					listeners?: { stdout: (data: string) => void };
				},
			) => {
				if (command === 'git') {
					isMain = true;
				} else if (command == 'dart') {
					const project = args[1].includes('p1') ? 'p1' : 'p2';
					const branch = isMain ? 'main' : 'feature-branch';
					const key = `${branch}/${project}`;
					options?.listeners?.stdout?.(results[key]);
				} else {
					// package name command
					if (failPackageNameResolution) {
						return Promise.resolve(1);
					}
					options?.listeners?.stdout?.(args[1].includes('p1') ? 'p1' : 'p2');
				}
				return Promise.resolve(0);
			},
		);

		return mockExec;
	}
});
