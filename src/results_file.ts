import { Project } from './action_context.js';
import { BenchmarkResults, ResultMap } from './result_map.js';

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

export function toResultsFile(
	projects: Project[],
	headBranch: string,
	baseBranch: string,
	results: ResultMap,
): ResultsFile {
	return {
		version: 1,
		projects: projects.map(project => ({
			name: project.identifier(),
			head: results.get(project, 'head').scores(),
			base: results.get(project, 'base').scores(),
		})),
		headBranch,
		baseBranch,
	};
}

export function fromResultsFile(file: ResultsFile): {
	projects: Project[];
	results: ResultMap;
} {
	const results = new ResultMap();
	const projects = file.projects.map(({ name, head, base }) => {
		const project = new Project(name, name);
		results.set(project, 'head', BenchmarkResults.fromScores(head));
		results.set(project, 'base', BenchmarkResults.fromScores(base));
		return project;
	});
	return { projects, results };
}
