import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Project } from './action_context.js';
import { CommentFormatter } from './comment_formatter.js';
import {
	BenchmarkResults,
	maxNameLength,
	ResultMap,
	reservedNames,
} from './result_map.js';

export type ResultsFile = {
	version: 1;
	projects: {
		name: string;
		head: Record<string, number>;
		base: Record<string, number>;
	}[];
	headBranch: string;
	baseBranch: string;
};

const maxFileLength = 1_000_000;
const maxProjects = 50;
const maxBenchmarks = 500;

export function toResultsFile(
	projects: Project[],
	headBranch: string,
	baseBranch: string,
	results: ResultMap,
): ResultsFile {
	return {
		version: 1,
		projects: projects.map(project => ({
			name: project.identifier().slice(0, maxNameLength),
			head: results.get(project, 'head').scores(),
			base: results.get(project, 'base').scores(),
		})),
		headBranch,
		baseBranch,
	};
}

export async function writeResultsFile(
	path: string,
	file: ResultsFile,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);
}

export function formatResultsFile(file: ResultsFile): string {
	const results = new ResultMap();
	const projects = file.projects.map(({ name, head, base }, index) => {
		// the file has no paths, and names can repeat, so use the position instead
		const project = new Project(`${index}`, name);
		results.set(project, 'head', BenchmarkResults.fromScores(head));
		results.set(project, 'base', BenchmarkResults.fromScores(base));
		return project;
	});
	return new CommentFormatter(
		projects,
		file.headBranch,
		file.baseBranch,
		results,
	).format();
}

// Reads a file written by code from the PR, which is free to write anything. What
// comes out only has safe names and finite numbers, and is within the limits.
export function parseResultsFile(contents: string): ResultsFile {
	if (contents.length > maxFileLength) {
		throw new Error('Invalid results file: too large.');
	}

	const file: unknown = JSON.parse(contents);
	if (!isRecord(file) || file.version !== 1 || !Array.isArray(file.projects)) {
		throw new Error('Invalid results file: unexpected shape.');
	}
	if (file.projects.length > maxProjects) {
		throw new Error('Invalid results file: too many projects.');
	}

	const projects = file.projects.map((project: unknown) => {
		if (!isRecord(project)) {
			throw new Error('Invalid results file: unexpected project.');
		}
		return {
			name: parseName(project.name),
			head: parseScores(project.head),
			base: parseScores(project.base),
		};
	});

	const benchmarks = projects.reduce(
		(total, { head, base }) =>
			total + Object.keys(head).length + Object.keys(base).length,
		0,
	);
	if (benchmarks > maxBenchmarks) {
		throw new Error('Invalid results file: too many benchmarks.');
	}

	return {
		version: 1,
		projects,
		// not part of what the PR gets to decide; the reporter sets these from GitHub
		headBranch: '',
		baseBranch: '',
	};
}

// Only keeps characters that cannot form markdown, links, HTML or mentions.
export function sanitizeName(name: string): string {
	return name.replace(/[^\p{L}\p{N} ._/()-]/gu, '_').replace(/www\./gi, 'www_');
}

function parseName(name: unknown): string {
	if (
		typeof name !== 'string' ||
		name.length === 0 ||
		name.length > maxNameLength
	) {
		throw new Error('Invalid results file: unexpected name.');
	}
	return sanitizeName(name);
}

function parseScores(scores: unknown): Record<string, number> {
	if (!isRecord(scores)) {
		throw new Error('Invalid results file: unexpected scores.');
	}
	return Object.fromEntries(
		Object.entries(scores).map(([name, score]) => {
			if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
				throw new Error('Invalid results file: unexpected score.');
			}
			// these become object keys
			if (reservedNames.has(name)) {
				throw new Error('Invalid results file: unexpected name.');
			}
			return [parseName(name), score];
		}),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
