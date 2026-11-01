import * as core from '@actions/core';
import * as github from '@actions/github';
import type { ReportContext } from './action_context.js';
import { CommentFormatter } from './comment_formatter.js';
import { logError } from './log.js';
import { fromResultsFile, type ResultsFile } from './results_file.js';

export async function reportResults(
	context: ReportContext,
	resultsFile: ResultsFile,
): Promise<void> {
	core.info(`Compiling results into comment body:`);
	const { projects, results } = fromResultsFile(resultsFile);
	const commentFormatter = new CommentFormatter(
		projects,
		resultsFile.headBranch,
		resultsFile.baseBranch,
		results,
	);
	const commentBody = commentFormatter.format();

	core.info(`Creating or updating comment on GitHub:`);
	try {
		await createOrUpdateComment(context, commentBody);
	} catch (error) {
		logError(error, 'Failed to create or update comment on GitHub.');
		// do not set the status to failed; this is not the PR's fault!
	}
}

async function createOrUpdateComment(
	context: ReportContext,
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
