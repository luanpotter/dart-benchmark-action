export type Repository = {
	owner: string;
	repo: string;
};

export type ActionContext = {
	githubToken: string;
	repository: Repository;
	prNumber: number;
	projects: string[];
	headBranch: string;
	baseBranch: string;
};
