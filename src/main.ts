import * as core from '@actions/core';
import * as github from '@actions/github';
import { exec } from '@actions/exec';

export async function run(): Promise<void> {
	try {
		const benchmarkPaths = core
			.getInput('paths', { required: true })
			.split(',');

		const repoToken = process.env.GITHUB_TOKEN;
		if (!repoToken) {
			throw new Error('GITHUB_TOKEN environment variable is required.');
		}

		const octokit = github.getOctokit(repoToken);
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

		const results: Record<string, { head: string; base: string }> = {};

		// Run benchmarks for the current branch
		for (const path of benchmarkPaths) {
			const trimmedPath = path.trim();

			core.info(`Running benchmarks for current branch: ${trimmedPath}`);

			try {
				const output = await executeCommand('dart', [
					'run',
					`${trimmedPath}/benchmark/main.dart`,
				]);
				results[trimmedPath] = { head: output, base: '' };
			} catch (error) {
				logError(
					error,
					`Failed to run benchmark on current branch for ${trimmedPath}`,
				);
			}
		}

		// Checkout the main branch
		await executeCommand('git', ['fetch', 'origin', baseBranch]);
		await executeCommand('git', ['checkout', baseBranch]);

		// Run benchmarks for the main branch
		for (const path of benchmarkPaths) {
			const trimmedPath = path.trim();

			core.info(`Running benchmarks for main branch: ${trimmedPath}`);

			try {
				const output = await executeCommand('dart', [
					'run',
					`${trimmedPath}/benchmark/main.dart`,
				]);
				if (results[trimmedPath]) {
					results[trimmedPath].base = output;
				} else {
					results[trimmedPath] = { head: '', base: output };
				}
			} catch (error) {
				logError(
					error,
					`Failed to run benchmark on main branch for ${trimmedPath}`,
				);
			}
		}

		// Checkout the head branch again
		await executeCommand('git', ['checkout', headBranch]);

		// Format the output
		const commentBody = formatResults(results);

		// Create or update PR comment
		const comments = await octokit.rest.issues.listComments({
			...context.repo,
			issue_number: prNumber,
		});

		const existingComment = comments.data.find(
			comment => comment.body && comment.body.includes('### Benchmark Results'),
		);

		if (existingComment) {
			await octokit.rest.issues.updateComment({
				...context.repo,
				comment_id: existingComment.id,
				body: commentBody,
			});
		} else {
			await octokit.rest.issues.createComment({
				...context.repo,
				issue_number: prNumber,
				body: commentBody,
			});
		}
	} catch (error) {
		if (error instanceof Error) core.setFailed(error.message);
	}
}

async function executeCommand(
	command: string,
	args: string[],
): Promise<string> {
	let output = '';
	let error = '';

	await exec(command, args, {
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
			stderr: (data: Buffer) => {
				error += data.toString();
			},
		},
	});

	if (error) {
		throw new Error(error);
	}

	return output;
}

function formatResults(
	results: Record<string, { head: string; base: string }>,
): string {
	let body = '### Benchmark Results\n\n';

	for (const [path, result] of Object.entries(results)) {
		body += `**${path}**\n\n`;
		body += `**Current Branch:**\n\`\`\`\n${result.head}\n\`\`\`\n\n`;
		body += `**Main Branch:**\n\`\`\`\n${result.base}\n\`\`\`\n\n`;
	}

	return body;
}

function logError(error: unknown, message: string): void {
	if (error instanceof Error) {
		core.error(`${message}: ${error.message}`);
	} else {
		// we cannot log an "unknown" error because typescript...
		core.error(`${message}: [CATASTROPHIC ERROR]`);
	}
}
