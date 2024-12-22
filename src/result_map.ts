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

	getMessage(): string {
		const score = this.getScore();
		if (score === 0) {
			return '[ERROR]';
		}
		return `${score.toFixed(3)} us`;
	}

	static success(output: string): BenchmarkOutput {
		return new BenchmarkOutput(output.trim());
	}

	static error(): BenchmarkOutput {
		return new BenchmarkOutput(undefined);
	}

	static diffMessage(a: BenchmarkOutput, b: BenchmarkOutput): string {
		const scoreA = a.getScore();
		const scoreB = b.getScore();
		if (scoreA === 0 || scoreB === 0) {
			return '[ERROR]';
		}

		const diff = ((scoreA - scoreB) / scoreB) * 100;
		const sign = diff > 0 ? '+' : '';
		return `${sign}${diff.toFixed(3)} %`;
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

	get(project: string, branch: string): BenchmarkOutput {
		return (
			this.results.get(ResultMap._toKey(project, branch)) ??
			BenchmarkOutput.error()
		);
	}
}
