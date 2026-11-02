import * as core from '@actions/core';
import * as github from '@actions/github';
import { Project, type RunContext } from './action_context.js';
import { reportWorkflowRun } from './reporter.js';
import {
	formatResultsFile,
	toResultsFile,
	writeResultsFile,
} from './results_file.js';
import { extractProjectName, runAllBenchmarks } from './runner.js';

export async function run(): Promise<void> {
	try {
		const { eventName } = github.context;
		if (eventName === 'pull_request') {
			await runOnPullRequest();
		} else if (eventName === 'workflow_run') {
			await reportWorkflowRun();
		} else {
			// other events, especially pull_request_target, can carry an untrusted PR,
			// but would run its code with a token that can write to the repository
			throw new Error(
				'This action only works on pull_request and workflow_run events.',
			);
		}
	} catch (error) {
		core.setFailed(error instanceof Error ? error.message : String(error));
	}
}

// Runs code from the PR, so it refuses to even be given a token to expose.
async function runOnPullRequest(): Promise<void> {
	if (process.env.GITHUB_TOKEN) {
		throw new Error(
			'GITHUB_TOKEN must not be set, as this step runs code from the pull request.',
		);
	}

	const resultsPath = core.getInput('results_path', { required: true });

	const context = await buildRunContext();
	if (!context) {
		return;
	}

	const results = await runAllBenchmarks(context);
	const resultsFile = toResultsFile(
		context.projects,
		context.headBranch,
		context.baseBranch,
		results,
	);

	core.info(`Writing results to ${resultsPath}:`);
	await writeResultsFile(resultsPath, resultsFile);
	await core.summary.addRaw(formatResultsFile(resultsFile)).write();
}

async function buildRunContext(): Promise<RunContext | undefined> {
	core.info('Collecting information to run benchmarks:');

	const isFlutter = core.getBooleanInput('is_flutter', { required: true });
	const ignoreTag = core.getInput('ignore_tag', { required: false });
	const buildCommand =
		core.getInput('build_command', { required: false }) || undefined;
	const runCommand =
		core.getInput('run_command', { required: false }) || undefined;

	const projectPaths = core
		.getInput('paths', { required: true })
		.split(',')
		.map(path => path.trim());

	const pullRequest = github.context.payload.pull_request;
	if (!pullRequest) {
		throw new Error('No pull request found in the event payload.');
	}

	// get tags and see if there is `ignore-benchmarks` tag
	if (ignoreTag) {
		const labels = pullRequest.labels as { name: string }[];
		const tags: string[] = labels.map(label => label.name);
		if (tags.includes(ignoreTag)) {
			core.info(`Ignoring benchmarks because of \`${ignoreTag}\` tag.`);
			return undefined;
		}
	}

	// we need unsafe member access because typescript...
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const headBranch: string = pullRequest.head.ref as string;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const baseBranch: string = pullRequest.base.ref as string;

	const projects = await Promise.all(
		projectPaths.map(
			async path => new Project(path, await extractProjectName(path)),
		),
	);

	return {
		isFlutter,
		buildCommand,
		runCommand,
		projects,
		headBranch,
		baseBranch,
	};
}
