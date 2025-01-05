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

		github.context.payload = {
			pull_request: {
				number: 123,
				head: { ref: 'feature-branch' },
				base: { ref: 'main' },
				labels: [{ name: 'ignore-benchmarks' }],
			},
		};

		process.env.GITHUB_TOKEN = 'fake-token';
	});

	it('should fetch inputs and execute benchmarks on both branches', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });
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

		// name extraction
		expectExec(
			mockExec,
			'(cd packages/p1 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);
		expectExec(
			mockExec,
			'(cd packages/p2 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);

		// benchmark execution
		expectExec(mockExec, '(cd packages/p1 ; dart run benchmark/main.dart)');
		expectExec(mockExec, '(cd packages/p2 ; dart run benchmark/main.dart)');

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
				'<summary><h3>Package <b>p2</b>: 🟢 -0.166 %</h3></summary>',
				' * Current Branch [feature-branch]: 200.123 μs',
				' * Base Branch [main]: 200.456 μs',
				' * Diff: 🟢 -0.166 %',
				'</details>',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
				'',
			].join('\n'),
		});
	});

	it('should execute in flutter mode', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2', isFlutter: true });
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

		// name extraction
		expectExec(
			mockExec,
			'(cd packages/p1 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);
		expectExec(
			mockExec,
			'(cd packages/p2 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);

		// benchmark execution
		expectExec(
			mockExec,
			'(cd packages/p1 ; flutter test benchmark/main.dart -r silent) 2>/dev/null || true',
		);
		expectExec(
			mockExec,
			'(cd packages/p2 ; flutter test benchmark/main.dart -r silent) 2>/dev/null || true',
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
				'<summary><h3>Package <b>p2</b>: 🟢 -0.166 %</h3></summary>',
				' * Current Branch [feature-branch]: 200.123 μs',
				' * Base Branch [main]: 200.456 μs',
				' * Diff: 🟢 -0.166 %',
				'</details>',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
				'',
			].join('\n'),
		});
	});

	it('should handle package name resolution failure gracefully', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });
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

		expectExec(mockExec, '(cd packages/p1 ; dart run benchmark/main.dart)');
		expectExec(mockExec, '(cd packages/p2 ; dart run benchmark/main.dart)');

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
				'<summary><h3>Package <b>packages/p2</b>: 🟢 -0.166 %</h3></summary>',
				' * Current Branch [feature-branch]: 200.123 μs',
				' * Base Branch [main]: 200.456 μs',
				' * Diff: 🟢 -0.166 %',
				'</details>',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
				'',
			].join('\n'),
		});
	});

	it('should update an existing comment if present', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });
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

		expectExec(mockExec, '(cd packages/p1 ; dart run benchmark/main.dart)');
		expectExec(mockExec, '(cd packages/p2 ; dart run benchmark/main.dart)');

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
				'<summary><h3>Package <b>p2</b>: 🟢 -0.166 %</h3></summary>',
				' * Current Branch [feature-branch]: 200.123 μs',
				' * Base Branch [main]: 200.456 μs',
				' * Diff: 🟢 -0.166 %',
				'</details>',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
				'',
			].join('\n'),
		});
	});

	it('should fail if no pull request context is available', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });
		github.context.payload = {};

		await run();

		expect(core.setFailed).toHaveBeenCalledWith(
			'This action only works on pull request events.',
		);
	});

	it('should handle benchmark execution errors gracefully', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });

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

	function mockActionInput({
		paths,
		ignoreTag = undefined,
		isFlutter = false,
	}: {
		paths: string;
		ignoreTag?: string;
		isFlutter?: boolean;
	}): void {
		(core.getInput as jest.Mock).mockImplementation(arg => {
			if (arg === 'paths') {
				return paths;
			} else if (arg === 'ignore-tag') {
				return ignoreTag;
			} else {
				throw new Error(`Unexpected input: ${arg}`);
			}
		});
		(core.getBooleanInput as jest.Mock).mockImplementation(arg => {
			if (arg === 'is-flutter') {
				return isFlutter;
			} else {
				throw new Error(`Unexpected input: ${arg}`);
			}
		});
	}

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
				bash,
				args: string[],
				options: {
					listeners?: { stdout: (data: string) => void };
				},
			) => {
				const command = args[1];
				const project = command.includes('p1') ? 'p1' : 'p2';
				let response: string | undefined = undefined;
				if (command.startsWith('git ')) {
					isMain = true;
				} else if (
					command.includes('; dart ') ||
					command.includes('; flutter ')
				) {
					const branch = isMain ? 'main' : 'feature-branch';
					const key = `${branch}/${project}`;
					response = results[key];
				} else if (command.startsWith('(cd ')) {
					// package name command
					if (failPackageNameResolution) {
						return Promise.resolve(1);
					}
					response = project;
				}
				if (response !== undefined) {
					options?.listeners?.stdout?.(response);
				}
				return Promise.resolve(0);
			},
		);

		return mockExec;
	}

	function expectExec(mockExec: jest.Mock, command: string): void {
		expect(mockExec).toHaveBeenCalledWith(
			'/bin/bash',
			['-c', command],
			expect.anything(),
		);
	}
});
