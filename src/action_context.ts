export type Repository = {
	owner: string;
	repo: string;
};

export class Project {
	path: string;
	// Script might fail to find the project name; in which case the path
	// will be used as display name.
	name: string | undefined;

	constructor(path: string, name: string | undefined) {
		this.path = path;
		this.name = name;
	}

	identifier(): string {
		return this.name ?? this.path;
	}
}

// What running benchmarks needs. This runs code from the PR, so no token here.
export type RunContext = {
	isFlutter: boolean;
	buildCommand: string | undefined;
	runCommand: string | undefined;
	projects: Project[];
	currentBranch: string;
	baseBranch: string;
};

// What reporting results needs.
export type ReportContext = {
	githubToken: string;
	repository: Repository;
	prNumber: number;
};

export type ActionContext = RunContext & ReportContext;
