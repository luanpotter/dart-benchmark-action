export class BenchmarkOutput {
	private output: string | undefined;

	private constructor(output: string | undefined) {
		this.output = output;
	}

	getScore(): number {
		if (this.output === undefined) {
			return 0;
		}

		// output in the format: Template(RunTime): 252.7379020979021 us.
		try {
			return parseFloat(this.output.split(' ')[1]);
		} catch {
			throw new Error(`Failed to parse benchmark output: ${this.output}`);
		}
	}

	getCommentBody(): string | undefined {
		if (this.output === undefined) {
			return undefined;
		}

		return `${this.getScore()} us`;
	}

	static success(output: string): BenchmarkOutput {
		return new BenchmarkOutput(output.trim());
	}

	static error(): BenchmarkOutput {
		return new BenchmarkOutput(undefined);
	}
}

export class ResultMap {
	private results = new Map<string, BenchmarkOutput>();

	private static _toKey(project: string, branch: string): string {
		return `${project}/${branch}`;
	}

	set(project: string, branch: string, value: BenchmarkOutput): this {
		this.results.set(ResultMap._toKey(project, branch), value);
		return this;
	}

	get(project: string, branch: string): BenchmarkOutput | undefined {
		return this.results.get(ResultMap._toKey(project, branch));
	}

	getMessage(project: string, branch: string): string {
		return this.get(project, branch)?.getCommentBody() ?? '[ERROR]';
	}
}
