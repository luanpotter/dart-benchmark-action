import * as core from '@actions/core';
import * as github from '@actions/github';
import { exec } from '@actions/exec';
import { BenchmarkResults, ResultMap, type Side } from './result_map.js';
import { type ActionContext, Project } from './action_context.js';
import { CommentFormatter } from './comment_formatter.js';

export async function run(): Promise<void> {
	try {
		core.info('Collecting information to run benchmarks:');
		const context = await buildContext();
		if (!context) {
			return;
		}

		core.info('Create result map:');
		const results = new ResultMap();

		core.info(`Running benchmarks for ${context.currentBranch}:`);
		await runBenchmarks(context, results, 'head', context.currentBranch);

		core.info('Fetching main branch...');
		await executeCommand(`git fetch origin ${context.baseBranch}`);
		await executeCommand(`git checkout ${context.baseBranch}`);

		core.info(`Running benchmarks for ${context.baseBranch}:`);
		await runBenchmarks(context, results, 'base', context.baseBranch);

		core.info(`Compiling results into comment body:`);
		const commentFormatter = new CommentFormatter(
			context.projects,
			context.currentBranch,
			context.baseBranch,
			results,
		);

		core.info(`Creating or updating comment on GitHub:`);
		try {
			await createOrUpdateComment(context, commentFormatter.format());
		} catch (error) {
			logError(error, 'Failed to create or update comment on GitHub.');
			// do not set the status to failed; this is not the PR's fault!
			return;
		}
	} catch (error) {
		if (error instanceof Error) core.setFailed(error.message);
	}
}

async function createOrUpdateComment(
	context: ActionContext,
	commentBody: string,
): Promise<void> {
	const octokit = github.getOctokit(context.githubToken);
	const comments = await octokit.rest.issues.listComments({
		...context.repository,
		issue_number: context.prNumber,
	});

	const existingComment = comments.data.find(comment =>
		comment.body?.includes('## Benchmark Results'),
	);

	if (existingComment) {
		await octokit.rest.issues.updateComment({
			...context.repository,
			comment_id: existingComment.id,
			body: commentBody,
		});
	} else {
		await octokit.rest.issues.createComment({
			...context.repository,
			issue_number: context.prNumber,
			body: commentBody,
		});
	}
}

// for dart-mode, we can just run
// dart run $path/benchmark/main.dart
// but for flutter-mode, we need to hack it with flutter test
// flutter test $path/benchmark/main.dart -r silent 2>/dev/null || true
// sadly there does not seem to be any other way
async function runBenchmarks(
	context: ActionContext,
	results: ResultMap,
	side: Side,
	branch: string,
): Promise<void> {
	for (const project of context.projects) {
		const { path } = project;
		const command = context.isFlutter
			? `(cd ${path} ; flutter test benchmark/main.dart -r silent) 2>/dev/null || true`
			: `(cd ${path} ; dart run benchmark/main.dart)`;
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
			await executeCommand(`(cd ${path} ; ${buildCommand})`);
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

async function buildContext(): Promise<ActionContext | undefined> {
	const isFlutter = core.getBooleanInput('is-flutter', { required: true });
	const ignoreTag = core.getInput('ignore-tag', { required: false });
	const buildCommand =
		core.getInput('build-command', { required: false }) || undefined;

	const projectPaths = core
		.getInput('paths', { required: true })
		.split(',')
		.map(path => path.trim());

	const githubToken = process.env.GITHUB_TOKEN;
	if (!githubToken) {
		throw new Error('GITHUB_TOKEN environment variable is required.');
	}

	const context = github.context;
	const pullRequest = context.payload.pull_request;

	// other events, especially pull_request_target, can carry an untrusted PR,
	// but would run its code with a token that can write to the repository
	if (context.eventName !== 'pull_request' || !pullRequest) {
		throw new Error('This action only works on pull_request events.');
	}

	// get tags and see if there is `ignore-benchmarks` tag
	if (ignoreTag !== undefined) {
		const labels = pullRequest.labels as { name: string }[];
		const tags: string[] = labels.map(label => label.name);
		if (tags.includes(ignoreTag)) {
			core.info(`Ignoring benchmarks because of \`${ignoreTag}\` tag.`);
			return undefined;
		}
	}

	const prNumber: number = pullRequest.number;
	// we need unsafe member access because typescript...
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const currentBranch: string = pullRequest.head.ref as string;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const baseBranch: string = pullRequest.base.ref as string;

	const projects = await Promise.all(
		projectPaths.map(
			async path => new Project(path, await extractProjectName(path)),
		),
	);

	return {
		githubToken,
		repository: {
			owner: context.repo.owner,
			repo: context.repo.repo,
		},
		prNumber,
		isFlutter,
		buildCommand,
		projects,
		currentBranch,
		baseBranch,
	};
}

async function extractProjectName(path: string): Promise<string | undefined> {
	try {
		const output = await executeCommand(
			`(cd ${path} ; cat pubspec.yaml | grep "^name:"| perl -pe 's/^name: (.*)$/$1/')`,
		);
		return output.trim();
	} catch (error) {
		logError(error, `Failed to extract project name for ${path}`);
		return undefined;
	}
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

// remove github token from the context of the benchmark running from a PR
function buildCommandEnv(): Record<string, string> {
	const entries = Object.entries(process.env).filter(
		(entry): entry is [string, string] =>
			entry[0] !== 'GITHUB_TOKEN' && entry[1] !== undefined,
	);
	return Object.fromEntries(entries);
}

function logError(error: unknown, message: string): void {
	if (error instanceof Error) {
		core.error(`+ ${message}: ${error.message}`);
	} else {
		// we cannot log an "unknown" error because typescript...
		core.error(`+ ${message}: [CATASTROPHIC ERROR]`);
	}
}
