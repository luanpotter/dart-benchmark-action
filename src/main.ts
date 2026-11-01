import * as core from '@actions/core';
import * as github from '@actions/github';
import { type ActionContext, Project } from './action_context.js';
import { reportResults } from './reporter.js';
import { toResultsFile } from './results_file.js';
import { extractProjectName, runAllBenchmarks } from './runner.js';

export async function run(): Promise<void> {
	try {
		core.info('Collecting information to run benchmarks:');
		const context = await buildContext();
		if (!context) {
			return;
		}

		const results = await runAllBenchmarks(context);

		await reportResults(
			context,
			toResultsFile(
				context.projects,
				context.currentBranch,
				context.baseBranch,
				results,
			),
		);
	} catch (error) {
		if (error instanceof Error) core.setFailed(error.message);
	}
}

async function buildContext(): Promise<ActionContext | undefined> {
	const isFlutter = core.getBooleanInput('is-flutter', { required: true });
	const ignoreTag = core.getInput('ignore-tag', { required: false });
	const buildCommand =
		core.getInput('build-command', { required: false }) || undefined;
	const runCommand =
		core.getInput('run-command', { required: false }) || undefined;

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
		runCommand,
		projects,
		currentBranch,
		baseBranch,
	};
}
