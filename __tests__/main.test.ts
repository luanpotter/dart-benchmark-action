import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import type { ExecOptions } from '@actions/exec';

const getInput = jest.fn<(name: string) => string | undefined>();
const getBooleanInput = jest.fn<(name: string) => boolean>();
const info = jest.fn<(message: string) => void>();
const error = jest.fn<(message: string) => void>();
const setFailed = jest.fn<(message: string) => void>();
const summary = {
	addRaw: jest.fn<(text: string) => unknown>(),
	write: jest.fn<() => Promise<unknown>>(),
};
jest.unstable_mockModule('@actions/core', () => ({
	getInput,
	getBooleanInput,
	info,
	error,
	setFailed,
	summary,
}));

const mockExec =
	jest.fn<
		(command: string, args: string[], options: ExecOptions) => Promise<number>
	>();
jest.unstable_mockModule('@actions/exec', () => ({ exec: mockExec }));

const getOctokit = jest.fn<(token: string) => unknown>();
const context = {
	eventName: 'pull_request',
	payload: {} as Record<string, unknown>,
	repo: { owner: 'owner', repo: 'repo' },
};
jest.unstable_mockModule('@actions/github', () => ({ getOctokit, context }));

const { run } = await import('../src/main.js');

describe('running on pull_request', () => {
	let directory: string;
	let resultsPath: string;

	beforeEach(async () => {
		jest.resetAllMocks();
		summary.addRaw.mockReturnValue(summary);
		delete process.env.GITHUB_TOKEN;
		delete process.env.GITHUB_ACTIONS;

		directory = await mkdtemp(join(tmpdir(), 'dart-benchmark-action-'));
		resultsPath = join(directory, 'nested', 'results.json');

		context.eventName = 'pull_request';
		context.payload = {
			pull_request: {
				number: 123,
				head: { ref: 'feature-branch' },
				base: { ref: 'main' },
				labels: [{ name: 'ignore-benchmarks' }],
			},
		};
	});

	afterEach(async () => {
		await rm(directory, { recursive: true });
	});

	it('should fetch inputs and execute benchmarks on both branches', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});

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

		expect(summary.addRaw).toHaveBeenCalledWith(
			[
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
		);
		expect(summary.write).toHaveBeenCalled();
	});

	it('should write the results of both branches to the file, without using GitHub', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});

		await run();

		expect(JSON.parse(await readFile(resultsPath, 'utf8'))).toEqual({
			version: 1,
			projects: [
				{
					name: 'p1',
					head: { Template: 100.456 },
					base: { Template: 100.123 },
				},
				{
					name: 'p2',
					head: { Template: 200.123 },
					base: { Template: 200.456 },
				},
			],
			headBranch: 'feature-branch',
			baseBranch: 'main',
		});
		expect(getOctokit).not.toHaveBeenCalled();
		expect(setFailed).not.toHaveBeenCalled();
	});

	it('should run nothing if the step has a token', async () => {
		process.env.GITHUB_TOKEN = 'fake-token';
		mockActionInput({ paths: 'packages/p1' });

		await run();

		expect(setFailed).toHaveBeenCalledWith(
			'GITHUB_TOKEN must not be set, as this step runs code from the pull request.',
		);
		expect(mockExec).not.toHaveBeenCalled();
	});

	it('should write no file when skipped by the ignore tag', async () => {
		mockActionInput({
			paths: 'packages/p1',
			ignoreTag: 'ignore-benchmarks',
		});

		await run();

		await expect(readFile(resultsPath)).rejects.toThrow('ENOENT');
		expect(mockExec).not.toHaveBeenCalled();
		expect(setFailed).not.toHaveBeenCalled();
	});

	it('should compare both sides of a pull request from a fork, with the same branch name', async () => {
		mockActionInput({ paths: 'packages/p1' });
		context.payload = {
			pull_request: {
				number: 123,
				head: { ref: 'main' },
				base: { ref: 'main' },
				labels: [],
			},
		};
		mockCommandOutputs({
			// the mock is on `feature-branch` until the action checks out the base
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'main/p1': 'Template(RunTime): 100.123 us.',
		});

		await run();

		expect(summary.addRaw).toHaveBeenCalledWith(
			[
				'## Benchmark Results',
				'',
				'### Package <b>p1</b>:',
				'',
				' * Current Branch [main]: 100.456 μs',
				' * Base Branch [main]: 100.123 μs',
				' * Diff: 🔴 +0.333 %',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
				'',
			].join('\n'),
		);
	});

	it('should run the build command in each project before each benchmark, on both branches', async () => {
		mockActionInput({
			paths: 'packages/p1,packages/p2',
			buildCommand: 'make codegen',
		});
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});

		await run();

		const commands = mockExec.mock.calls.map(([, args]) => args[1]);
		expect(commands.slice(2)).toEqual([
			'(cd packages/p1 ; make codegen)',
			'(cd packages/p1 ; dart run benchmark/main.dart)',
			'(cd packages/p2 ; make codegen)',
			'(cd packages/p2 ; dart run benchmark/main.dart)',
			'git fetch origin main',
			'git checkout main',
			'(cd packages/p1 ; make codegen)',
			'(cd packages/p1 ; dart run benchmark/main.dart)',
			'(cd packages/p2 ; make codegen)',
			'(cd packages/p2 ; dart run benchmark/main.dart)',
		]);
		expect(summary.write).toHaveBeenCalledTimes(1);
	});

	it('should force the checkout of the base branch on GitHub only', async () => {
		mockActionInput({ paths: 'packages/p1' });
		mockCommandOutputs({});

		await run();
		expectExec('git checkout main');

		process.env.GITHUB_ACTIONS = 'true';
		await run();
		expectExec('git checkout --force main');
	});

	it('should report a branch with no results if its build fails, and still run the other', async () => {
		mockActionInput({ paths: 'packages/p1', buildCommand: 'make codegen' });
		mockCommandOutputs(
			{
				'main/p1': 'Template(RunTime): 100.123 us.',
				'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			},
			{ failBuildOn: 'feature-branch' },
		);

		await run();

		expect(error).toHaveBeenCalledWith(
			'+ Failed to build packages/p1 on branch feature-branch: Build failed',
		);
		expect(setFailed).not.toHaveBeenCalled();
		expect(summary.addRaw).toHaveBeenCalledWith(
			[
				'## Benchmark Results',
				'',
				'### Package <b>p1</b>:',
				'',
				' * Current Branch [feature-branch]: [-]',
				' * Base Branch [main]: 100.123 μs',
				' * Diff: [-]',
				'',
				'---',
				'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
				'',
			].join('\n'),
		);
	});

	it('should use the run command in each project on both branches, over the default', async () => {
		mockActionInput({
			paths: 'packages/p1,packages/p2',
			isFlutter: true,
			runCommand: 'dart compile exe bench.dart -o /tmp/bench && /tmp/bench',
		});
		mockCommandOutputs({
			'main/p1': 'Generated: /tmp/bench\nTemplate(RunTime): 100.123 us.',
			'main/p2': 'Generated: /tmp/bench\nTemplate(RunTime): 200.456 us.',
			'feature-branch/p1':
				'Generated: /tmp/bench\nTemplate(RunTime): 100.456 us.',
			'feature-branch/p2':
				'Generated: /tmp/bench\nTemplate(RunTime): 200.123 us.',
		});

		await run();

		const commands = mockExec.mock.calls.map(([, args]) => args[1]);
		expect(commands.slice(2)).toEqual([
			'(cd packages/p1 ; dart compile exe bench.dart -o /tmp/bench && /tmp/bench)',
			'(cd packages/p2 ; dart compile exe bench.dart -o /tmp/bench && /tmp/bench)',
			'git fetch origin main',
			'git checkout main',
			'(cd packages/p1 ; dart compile exe bench.dart -o /tmp/bench && /tmp/bench)',
			'(cd packages/p2 ; dart compile exe bench.dart -o /tmp/bench && /tmp/bench)',
		]);
		expect(summary.addRaw).toHaveBeenCalledWith(
			[
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
		);
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

		await run();

		// name extraction
		expectExec(
			'(cd packages/p1 ; cat pubspec.yaml | grep "^name:"| perl -pe \'s/^name: (.*)$/$1/\')',
		);

		// benchmark execution
		expectExec('(cd packages/p1 ; dart run benchmark/main.dart)');

		expect(summary.addRaw).toHaveBeenCalledWith(
			[
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
		);
	});

	it('should execute in flutter mode', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2', isFlutter: true });
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'main/p2': 'Template(RunTime): 200.456 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
			'feature-branch/p2': 'Template(RunTime): 200.123 us.',
		});

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

		expect(summary.addRaw).toHaveBeenCalledWith(
			[
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
		);
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

		await run();

		expectExec('(cd packages/p1 ; dart run benchmark/main.dart)');
		expectExec('(cd packages/p2 ; dart run benchmark/main.dart)');

		expect(summary.addRaw).toHaveBeenCalledWith(
			[
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
		);
	});

	it('should fail if no pull request context is available', async () => {
		mockActionInput({ paths: 'packages/p1,packages/p2' });
		context.payload = {};

		await run();

		expect(setFailed).toHaveBeenCalledWith(
			'No pull request found in the event payload.',
		);
		expect(mockExec).not.toHaveBeenCalled();
	});

	it.each(['pull_request_target', 'pull_request_review', 'push'])(
		'should run nothing on %s, even with a pull request in the payload',
		async eventName => {
			mockActionInput({ paths: 'packages/p1,packages/p2' });
			context.eventName = eventName;

			await run();

			expect(setFailed).toHaveBeenCalledWith(
				'This action only works on pull_request and workflow_run events.',
			);
			expect(mockExec).not.toHaveBeenCalled();
			expect(getOctokit).not.toHaveBeenCalled();
		},
	);

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

	it('should run commands in the step environment', async () => {
		mockActionInput({ paths: 'packages/p1' });
		mockCommandOutputs({
			'main/p1': 'Template(RunTime): 100.123 us.',
			'feature-branch/p1': 'Template(RunTime): 100.456 us.',
		});

		await run();

		// name extraction, head benchmark, git fetch, git checkout, base benchmark
		expect(mockExec.mock.calls.map(([, , options]) => options.env)).toEqual(
			Array(5).fill({ ...process.env }),
		);
	});

	function mockActionInput({
		paths,
		ignoreTag = undefined,
		isFlutter = false,
		buildCommand = '',
		runCommand = '',
	}: {
		paths: string;
		ignoreTag?: string;
		isFlutter?: boolean;
		buildCommand?: string;
		runCommand?: string;
	}): void {
		getInput.mockImplementation(arg => {
			if (arg === 'paths') {
				return paths;
			} else if (arg === 'ignore_tag') {
				return ignoreTag;
			} else if (arg === 'build_command') {
				return buildCommand;
			} else if (arg === 'run_command') {
				return runCommand;
			} else if (arg === 'results_path') {
				return resultsPath;
			} else {
				throw new Error(`Unexpected input: ${arg}`);
			}
		});
		getBooleanInput.mockImplementation(arg => {
			if (arg === 'is_flutter') {
				return isFlutter;
			} else {
				throw new Error(`Unexpected input: ${arg}`);
			}
		});
	}

	function mockCommandOutputs(
		results: Record<string, string>,
		options: {
			failPackageNameResolution?: boolean;
			failBuildOn?: 'feature-branch' | 'main';
		} = {},
	): void {
		const { failPackageNameResolution = false, failBuildOn } = options;

		let isMain = false;
		mockExec.mockImplementation(async (_, args, execOptions) => {
			const command = args[1];
			const project = command.includes('p1') ? 'p1' : 'p2';
			let response: string | undefined;
			if (command.startsWith('git ')) {
				isMain = true;
			} else if (command.includes('; make codegen')) {
				if (failBuildOn === (isMain ? 'main' : 'feature-branch')) {
					throw new Error('Build failed');
				}
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
