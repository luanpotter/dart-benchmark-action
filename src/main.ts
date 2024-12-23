import * as core from '@actions/core';
import * as github from '@actions/github';
import { exec } from '@actions/exec';
import { BenchmarkResults, ResultMap } from './result_map';
import { ActionContext, Project } from './action_context';
import { CommentFormatter } from './comment_formatter';

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
		for (const project of context.projects) {
			await runBenchmark(results, project, context.currentBranch);
		}

		core.info('Fetching main branch...');
		await executeCommand('git', ['fetch', 'origin', context.baseBranch]);
		await executeCommand('git', ['checkout', context.baseBranch]);

		core.info(`Running benchmarks for ${context.baseBranch}:`);
		for (const project of context.projects) {
			await runBenchmark(results, project, context.baseBranch);
		}

		core.info(`Compiling results into comment body:`);
		const commentFormatter = new CommentFormatter(
			context.projects,
			context.currentBranch,
			context.baseBranch,
			results,
		);

		core.info(`Creating or updating comment on GitHub:`);
		await createOrUpdateComment(context, commentFormatter.format());
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

	const existingComment = comments.data.find(
		comment => comment.body && comment.body.includes('## Benchmark Results'),
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

async function runBenchmark(
	results: ResultMap,
	project: Project,
	branch: string,
): Promise<void> {
	const { path } = project;
	core.info(`+ Running benchmarks for ${path} on branch ${branch}:`);

	let result: BenchmarkResults;
	try {
		const output = await executeCommand('dart', [
			'run',
			`${path}/benchmark/main.dart`,
		]);
		result = BenchmarkResults.success(output);
	} catch (error) {
		logError(error, `Failed to run benchmark for ${path} on branch ${branch}`);
		result = BenchmarkResults.error();
	}

	results.set(project, branch, result);
}

async function buildContext(): Promise<ActionContext | undefined> {
	const ignoreTag = core.getInput('ignore-tag', { required: false });

	const projectPaths = core
		.getInput('paths', { required: true })
		.split(',')
		.map(path => path.trim());

	const githubToken = process.env.GITHUB_TOKEN;
	if (!githubToken) {
		throw new Error('GITHUB_TOKEN environment variable is required.');
	}

	const context = github.context;

	if (!('pull_request' in context.payload && context.payload.pull_request)) {
		throw new Error('This action only works on pull request events.');
	}

	const pullRequest = context.payload.pull_request;

	// get tags and see if there is `ignore-benchmarks` tag
	if (ignoreTag !== undefined) {
		// we need unsafe member access because typescript...
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
		projects,
		currentBranch,
		baseBranch,
	};
}

async function extractProjectName(path: string): Promise<string | undefined> {
	try {
		const output = await executeCommand(`/bin/bash -c "`, [
			'-c',
			`(cd ${path} ; cat pubspec.yaml | grep "^name:"| perl -pe 's/^name: (.*)$/$1/')`,
		]);
		return output.trim();
	} catch (error) {
		logError(error, `Failed to extract project name for ${path}`);
		return undefined;
	}
}

async function executeCommand(
	command: string,
	args: string[],
): Promise<string> {
	let output = '';
	let error = '';

	core.info(` + Running command: ${command} ${args.join(' ')}`);
	const resultCode = await exec(command, args, {
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
			`Command ${[command, ...args].join(' ')} failed with ${resultCode}: ${error}`,
		);
	}

	return output;
}

function logError(error: unknown, message: string): void {
	if (error instanceof Error) {
		core.error(`+ ${message}: ${error.message}`);
	} else {
		// we cannot log an "unknown" error because typescript...
		core.error(`+ ${message}: [CATASTROPHIC ERROR]`);
	}
}
