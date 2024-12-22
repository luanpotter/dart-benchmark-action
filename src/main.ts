import * as core from '@actions/core';
import * as github from '@actions/github';
import { exec } from '@actions/exec';
import { BenchmarkOutput, ResultMap } from './result_map';
import { ActionContext } from './action_context';

export async function run(): Promise<void> {
	try {
		core.info('Collecting information to run benchmarks:');
		const context = buildContext();

		core.info('Create result map:');
		const results = new ResultMap();

		core.info(`Running benchmarks for ${context.headBranch}:`);
		for (const project of context.projects) {
			await runBenchmark(results, project, context.headBranch);
		}

		core.info('Fetching main branch...');
		await executeCommand('git', ['fetch', 'origin', context.baseBranch]);
		await executeCommand('git', ['checkout', context.baseBranch]);

		core.info(`Running benchmarks for ${context.baseBranch}:`);
		for (const project of context.projects) {
			await runBenchmark(results, project, context.baseBranch);
		}

		core.info(`Compiling results into comment body:`);
		const commentBody = compileResultsIntoCommentBody(context, results);

		core.info(`Creating or updating comment on GitHub:`);
		await createOrUpdateComment(context, commentBody);
	} catch (error) {
		if (error instanceof Error) core.setFailed(error.message);
	}
}

function compileResultsIntoCommentBody(
	context: ActionContext,
	results: ResultMap,
): string {
	const { headBranch, baseBranch } = context;
	let output = '## Benchmark Results\n\n';
	for (const project of context.projects) {
		const headResult = results.getMessage(project, headBranch);
		const baseResult = results.getMessage(project, baseBranch);

		output += `### *${project}*\n`;
		output += ` * Current Branch [${headBranch}]: ${headResult}\n`;
		output += ` * Base Branch [${baseBranch}]: ${baseResult}\n`;
		output += '\n';
	}

	return output;
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
	project: string,
	branch: string,
): Promise<void> {
	core.info(`+ Running benchmarks for ${project} on branch ${branch}:`);

	let result: BenchmarkOutput;
	try {
		const output = await executeCommand('dart', [
			'run',
			`${project}/benchmark/main.dart`,
		]);
		result = BenchmarkOutput.success(output);
	} catch (error) {
		logError(
			error,
			`Failed to run benchmark for ${project} on branch ${branch}`,
		);
		result = BenchmarkOutput.error();
	}

	results.set(project, branch, result);
}

function buildContext(): ActionContext {
	const projects = core
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

	const prNumber: number = pullRequest.number;
	// we need unsafe member access because typescript...
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const headBranch: string = pullRequest.head.ref as string;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const baseBranch: string = pullRequest.base.ref as string;

	return {
		githubToken,
		repository: {
			owner: context.repo.owner,
			repo: context.repo.repo,
		},
		prNumber,
		projects,
		headBranch,
		baseBranch,
	};
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
