import { jest } from '@jest/globals';
import type { ExecOptions } from '@actions/exec';

const getInput = jest.fn<(name: string) => string | undefined>();
const getBooleanInput = jest.fn<(name: string) => boolean>();
const info = jest.fn<(message: string) => void>();
const error = jest.fn<(message: string) => void>();
const setFailed = jest.fn<(message: string) => void>();
jest.unstable_mockModule('@actions/core', () => ({
	getInput,
	getBooleanInput,
	info,
	error,
	setFailed,
}));

const mockExec =
	jest.fn<
		(command: string, args: string[], options: ExecOptions) => Promise<number>
	>();
jest.unstable_mockModule('@actions/exec', () => ({ exec: mockExec }));

const getOctokit = jest.fn<(token: string) => unknown>();
const context = {
	payload: {} as Record<string, unknown>,
	repo: { owner: 'owner', repo: 'repo' },
};
jest.unstable_mockModule('@actions/github', () => ({ getOctokit, context }));

const { run } = await import('../src/main.js');

describe('run', () => {
	beforeEach(() => {
		jest.resetAllMocks();

		context.payload = {
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
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});
		const { listComments, createComment } = mockOctokit();

		await run();

		// name extraction
		expectExec(
			'(cd packages/p1 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);
		expectExec(
			'(cd packages/p2 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);

		// benchmark execution
		expectExec('(cd packages/p1 ; dart run benchmark/main.dart)');
		expectExec('(cd packages/p2 ; dart run benchmark/main.dart)');

		expect(listComments).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			issue_number: 123,
		});

		expect(createComment).toHaveBeenCalledWith({
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

	it('multiple templates are supported and extra lines are ignored', async () => {
		mockActionInput({ paths: 'packages/p1' });
		mockCommandOutputs({
			'main/p1': [
				'[extra lines are ignored]',
				'T1(RunTime): 100.456 us.',
				'[extra lines are ignored]',
				'T2(RunTime): 200.456 us.',
				'[extra lines are ignored]',
			].join('\n'),
			'feature-branch/p1': [
				'T1(RunTime): 100.123 us.',
				'T3(RunTime): 300.123 us.',
				'[extra lines are ignored]',
				'[extra lines are ignored]',
				'[extra lines are ignored]',
			].join('\n'),
		});
		const { listComments, createComment } = mockOctokit();

		await run();

		// name extraction
		expectExec(
			'(cd packages/p1 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);

		// benchmark execution
		expectExec('(cd packages/p1 ; dart run benchmark/main.dart)');

		expect(listComments).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			issue_number: 123,
		});

		expect(createComment).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			issue_number: 123,
			body: [
				'## Benchmark Results',
				'',
				'### Package <b>p1</b>:',
				'',
				'| Benchmarks | Current Branch<br/>[feature-branch] | Base Branch<br/>[main] | Diff |',
				'| ------------- | -------- | -------- | -------- |',
				'| T1 | 100.123 μs | 100.456 μs | 🟢 -0.331 % |',
				'| T3 | 300.123 μs | [-] | [-] |',
				'| T2 | [-] | 200.456 μs | [-] |',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
				'',
			].join('\n'),
		});
	});

	it('should execute in flutter mode', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2', isFlutter: true });
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});
		const { listComments, createComment } = mockOctokit();

		await run();

		// name extraction
		expectExec(
			'(cd packages/p1 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);
		expectExec(
			'(cd packages/p2 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);

		// benchmark execution
		expectExec(
			'(cd packages/p1 ; flutter test benchmark/main.dart -r silent) 2>/dev/null || true',
		);
		expectExec(
			'(cd packages/p2 ; flutter test benchmark/main.dart -r silent) 2>/dev/null || true',
		);

		expect(listComments).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			issue_number: 123,
		});

		expect(createComment).toHaveBeenCalledWith({
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
		mockCommandOutputs(
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
		const { listComments, createComment } = mockOctokit();

		await run();

		expectExec('(cd packages/p1 ; dart run benchmark/main.dart)');
		expectExec('(cd packages/p2 ; dart run benchmark/main.dart)');

		expect(listComments).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			issue_number: 123,
		});

		expect(createComment).toHaveBeenCalledWith({
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
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});
		const { updateComment } = mockOctokit([
			{
				id: 1,
				body: '### Benchmark Results\nOld results',
			},
		]);

		await run();

		expectExec('(cd packages/p1 ; dart run benchmark/main.dart)');
		expectExec('(cd packages/p2 ; dart run benchmark/main.dart)');

		expect(updateComment).toHaveBeenCalledWith({
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
		context.payload = {};

		await run();

		expect(setFailed).toHaveBeenCalledWith(
			'This action only works on pull request events.',
		);
	});

	it('should handle benchmark execution errors gracefully', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });

		mockExec.mockRejectedValue(new Error('Execution failed'));

		await expect(run()).resolves.not.toThrow();

		expect(error).toHaveBeenCalledWith(
			'+ Failed to run benchmark for packages/p1 on branch feature-branch: Execution failed',
		);
		expect(error).toHaveBeenCalledWith(
			'+ Failed to run benchmark for packages/p2 on branch feature-branch: Execution failed',
		);
		expect(setFailed).toHaveBeenCalled();
	});

	it('should run commands in the step environment and keep the token for commenting', async () => {
		mockActionInput({ paths: 'packages/p1' });
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
		});
		const { createComment } = mockOctokit();

		await run();

		const commandEnv = { ...process.env };
		delete commandEnv.GITHUB_TOKEN;
		// name extraction, head benchmark, git fetch, git checkout, base benchmark
		expect(mockExec.mock.calls.map(([, , options]) => options.env)).toEqual(
			Array(5).fill(commandEnv),
		);

		expect(getOctokit).toHaveBeenCalledWith('fake-token');
		expect(createComment).toHaveBeenCalled();
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
		getInput.mockImplementation(arg => {
			if (arg === 'paths') {
				return paths;
			} else if (arg === 'ignore-tag') {
				return ignoreTag;
			} else {
				throw new Error(`Unexpected input: ${arg}`);
			}
		});
		getBooleanInput.mockImplementation(arg => {
			if (arg === 'is-flutter') {
				return isFlutter;
			} else {
				throw new Error(`Unexpected input: ${arg}`);
			}
		});
	}

	function mockOctokit(existingComments: { id: number; body: string }[] = []): {
		listComments: jest.Mock<(params: object) => Promise<unknown>>;
		createComment: jest.Mock<(params: object) => Promise<unknown>>;
		updateComment: jest.Mock<(params: object) => Promise<unknown>>;
	} {
		const listComments = jest
			.fn<(params: object) => Promise<unknown>>()
			.mockResolvedValue({ data: existingComments });
		const createComment = jest.fn<(params: object) => Promise<unknown>>();
		const updateComment = jest.fn<(params: object) => Promise<unknown>>();
		getOctokit.mockReturnValue({
			rest: { issues: { listComments, createComment, updateComment } },
		});
		return { listComments, createComment, updateComment };
	}

	function mockCommandOutputs(
		results: Record<string, string>,
		options: {
			failPackageNameResolution: boolean;
		} = {
			failPackageNameResolution: false,
		},
	): void {
		const { failPackageNameResolution } = options;

		let isMain = false;
		mockExec.mockImplementation(async (_, args, execOptions) => {
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
				execOptions.listeners?.stdout?.(Buffer.from(response));
			}
			return Promise.resolve(0);
		});
	}

	function expectExec(command: string): void {
		expect(mockExec).toHaveBeenCalledWith(
			'/bin/bash',
			['-c', command],
			expect.anything(),
		);
	}
});
