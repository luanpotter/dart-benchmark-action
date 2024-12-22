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

export type ActionContext = {
	githubToken: string;
	repository: Repository;
	prNumber: number;
	projects: Project[];
	headBranch: string;
	baseBranch: string;
};
