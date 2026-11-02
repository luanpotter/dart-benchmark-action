import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as core from '@actions/core';
import { exec } from '@actions/exec';
import type { Project, RunContext } from './action_context.js';
import { logError } from './log.js';
import { BenchmarkResults, ResultMap, type Side } from './result_map.js';

export async function runAllBenchmarks(
	context: RunContext,
): Promise<ResultMap> {
	core.info('Create result map:');
	const results = new ResultMap();

	core.info(`Running benchmarks for ${context.headBranch}:`);
	await runBenchmarks(context, results, 'head', context.headBranch);

	core.info(`Fetching ${context.baseBranch} branch...`);
	await executeCommand(`git fetch origin ${context.baseBranch}`);
	// a build can change tracked files, such as pubspec.lock, which would block this
	// force only on GitHub, as it would discard your changes on a local run
	const force = process.env.GITHUB_ACTIONS ? '--force ' : '';
	await executeCommand(`git checkout ${force}${context.baseBranch}`);

	core.info(`Running benchmarks for ${context.baseBranch}:`);
	await runBenchmarks(context, results, 'base', context.baseBranch);

	return results;
}

// For dart-mode, we can just run
// $ dart run $path/benchmark/main.dart
// But for flutter-mode, we need to hack it with flutter test
// $ flutter test $path/benchmark/main.dart -r silent 2>/dev/null || true
// Sadly, there does not seem to be any other way
async function runBenchmarks(
	context: RunContext,
	results: ResultMap,
	side: Side,
	branch: string,
): Promise<void> {
	for (const project of context.projects) {
		const path = shellQuote(project.path);
		let command: string;
		if (context.runCommand) {
			command = `(cd ${path} ; ${context.runCommand})`;
		} else if (context.isFlutter) {
			command = `(cd ${path} ; flutter test benchmark/main.dart -r silent) 2>/dev/null || true`;
		} else {
			command = `(cd ${path} ; dart run benchmark/main.dart)`;
		}
		await runBenchmark(
			results,
			context.buildCommand,
			command,
			project,
			side,
			branch,
		);
	}
}

async function runBenchmark(
	results: ResultMap,
	buildCommand: string | undefined,
	command: string,
	project: Project,
	side: Side,
	branch: string,
): Promise<void> {
	const { path } = project;

	if (buildCommand) {
		core.info(`+ Building ${path} on branch ${branch}:`);
		try {
			await executeCommand(`(cd ${shellQuote(path)} ; ${buildCommand})`);
		} catch (error) {
			logError(error, `Failed to build ${path} on branch ${branch}`);
			results.set(project, side, BenchmarkResults.error());
			return;
		}
	}

	core.info(`+ Running benchmarks for ${path} on branch ${branch}:`);

	let result: BenchmarkResults;
	try {
		const output = await executeCommand(command);
		result = BenchmarkResults.success(output);
	} catch (error) {
		logError(error, `Failed to run benchmark for ${path} on branch ${branch}`);
		result = BenchmarkResults.error();
	}

	results.set(project, side, result);
}

export async function extractProjectName(
	path: string,
): Promise<string | undefined> {
	try {
		const pubspec = await readFile(join(path, 'pubspec.yaml'), 'utf8');
		return /^name:\s*['"]?([^\s#'"]+)/m.exec(pubspec)?.[1];
	} catch (error) {
		logError(error, `Failed to extract project name for ${path}`);
		return undefined;
	}
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

async function executeCommand(command: string): Promise<string> {
	let output = '';
	let error = '';

	core.info(` + Running command: ${command}`);
	const resultCode = await exec('/bin/bash', ['-c', command], {
		env: buildCommandEnv(),
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
			stderr: (data: Buffer) => {
				error += data.toString();
			},
		},
	});

	if (resultCode !== 0) {
		throw new Error(
			`Command \`${command}\` failed with ${resultCode}: ${error}`,
		);
	}

	return output;
}

// Remove the GitHub token from the context of the benchmark running from a PR
function buildCommandEnv(): Record<string, string> {
	const entries = Object.entries(process.env).filter(
		(entry): entry is [string, string] =>
			entry[0] !== 'GITHUB_TOKEN' && entry[1] !== undefined,
	);
	return Object.fromEntries(entries);
}
