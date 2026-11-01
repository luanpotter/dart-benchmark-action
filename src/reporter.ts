import { readFile } from 'node:fs/promises';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { logError } from './log.js';
import {
	formatResultsFile,
	parseResultsFile,
	sanitizeName,
} from './results_file.js';

type WorkflowRun = {
	event: string;
	conclusion: string | null;
	head_sha: string;
	head_branch: string | null;
	head_repository: { owner: { login: string } } | null;
};

type Octokit = ReturnType<typeof github.getOctokit>;

const commentMarker = '<!-- dart-benchmark-action -->';
const commentAuthor = 'github-actions[bot]';

// This holds a token that can write to the repository, and reads a file written
// by code from the PR. So it must never run anything, which is why this module
// does not import @actions/exec, and it must treat that file as hostile.
export async function reportWorkflowRun(): Promise<void> {
	const workflowRun = github.context.payload.workflow_run as WorkflowRun;
	if (
		workflowRun.event !== 'pull_request' ||
		workflowRun.conclusion !== 'success'
	) {
		core.info(
			`Nothing to report for a ${workflowRun.event} run that ended in ${workflowRun.conclusion}.`,
		);
		return;
	}

	const resultsPath = core.getInput('results_path', { required: true });
	const contents = await readIfPresent(resultsPath);
	if (contents === undefined) {
		core.info('Nothing to report, as the run has no results.');
		return;
	}
	const resultsFile = parseResultsFile(contents);

	try {
		const octokit = github.getOctokit(
			core.getInput('github_token', { required: true }),
		);
		const pullRequest = await findPullRequest(octokit, workflowRun);
		if (!pullRequest) {
			core.info('Nothing to report, as no open pull request matches the run.');
			return;
		}

		// the branch names in the file come from the PR, so use the ones from GitHub
		const body = formatResultsFile({
			...resultsFile,
			headBranch: sanitizeName(pullRequest.head.ref),
			baseBranch: sanitizeName(pullRequest.base.ref),
		});

		core.info(`Creating or updating comment on #${pullRequest.number}:`);
		await createOrUpdateComment(
			octokit,
			pullRequest.number,
			`${commentMarker}\n${body}`,
		);
	} catch (error) {
		logError(error, 'Failed to create or update comment on GitHub.');
		// do not set the status to failed; this is not the PR's fault!
	}
}

async function readIfPresent(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return undefined;
		}
		throw error;
	}
}

// `workflow_run.pull_requests` is empty for forks, so look it up. The number must
// come from GitHub and not the results file, or a PR could comment on any other.
async function findPullRequest(
	octokit: Octokit,
	workflowRun: WorkflowRun,
): Promise<
	{ number: number; head: { ref: string }; base: { ref: string } } | undefined
> {
	const owner = workflowRun.head_repository?.owner.login;
	if (!owner || !workflowRun.head_branch) {
		return undefined;
	}

	const pullRequests = await octokit.rest.pulls.list({
		...github.context.repo,
		state: 'open',
		head: `${owner}:${workflowRun.head_branch}`,
	});
	return pullRequests.data.find(
		pullRequest => pullRequest.head.sha === workflowRun.head_sha,
	);
}

async function createOrUpdateComment(
	octokit: Octokit,
	prNumber: number,
	body: string,
): Promise<void> {
	const comments = await octokit.paginate(octokit.rest.issues.listComments, {
		...github.context.repo,
		issue_number: prNumber,
		per_page: 100,
	});

	// anyone can write the marker, so also check who wrote the comment
	const existingComment = comments.find(
		comment =>
			comment.user?.login === commentAuthor &&
			comment.body?.startsWith(commentMarker),
	);

	if (existingComment) {
		await octokit.rest.issues.updateComment({
			...github.context.repo,
			comment_id: existingComment.id,
			body,
		});
	} else {
		await octokit.rest.issues.createComment({
			...github.context.repo,
			issue_number: prNumber,
			body,
		});
	}
}
