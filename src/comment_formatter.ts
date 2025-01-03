import { Project } from './action_context';
import { BenchmarkDiff, ResultMap } from './result_map';

export class CommentFormatter {
	private projects: Project[];
	private currentBranch: string;
	private baseBranch: string;

	private results: ResultMap;

	private output: string[] = [];

	constructor(
		projects: Project[],
		currentBranch: string,
		baseBranch: string,
		results: ResultMap,
	) {
		this.projects = projects;
		this.currentBranch = currentBranch;
		this.baseBranch = baseBranch;

		this.results = results;
	}

	format(): string {
		this.output = [];
		this.renderLines();
		return this.output.join('\n');
	}

	private renderLines(): void {
		this.output.push('## Benchmark Results');
		this.output.push('');

		if (this.projects.length === 0) {
			this.output.push('> [!WARNING]', '> No projects to benchmark.', '');
		} else if (this.projects.length === 1) {
			this.renderSingleProject(this.projects[0]);
			this.output.push('');
		} else {
			for (const project of this.projects) {
				this.renderProject(project);
				this.output.push('');
			}
		}

		this.renderFinalMessage();
	}

	private renderSingleProject(project: Project): void {
		const diffs = this.computeDiffs(project);

		if (diffs.length === 0) {
			this.renderNoDiffsWarning(project);
			return;
		}

		this.output.push(`### Package <b>${project.identifier()}</b>:\n`);
		if (diffs.length === 1) {
			const diff = diffs[0];
			this.renderSingleDiff(diff);
		} else {
			this.renderTableDiff(diffs);
		}
	}

	private renderProject(project: Project): void {
		const diffs = this.computeDiffs(project);
		if (diffs.length === 0) {
			this.renderNoDiffsWarning(project);
			return;
		}

		const average =
			diffs.reduce((acc, diff) => acc + (diff?.diff ?? 0), 0) / diffs.length;

		this.output.push(
			`<details>`,
			`<summary><h3>Package <b>${project.identifier()}</b>: ${this.formatPercentage(average)}</h3></summary>`,
		);

		if (diffs.length === 1) {
			const diff = diffs[0];
			this.renderSingleDiff(diff);
		} else {
			this.renderTableDiff(diffs);
		}

		this.output.push(`</details>`);
	}

	private renderNoDiffsWarning(project: Project): void {
		this.output.push(
			'> [!WARNING]',
			`No benchmark results found for package ${project.identifier()}.`,
		);
	}

	private renderSingleDiff(diff: BenchmarkDiff): void {
		/**
		 * * Current Branch [luan.try-out-new-benchmark]: 246.015 us
		 * * Base Branch [main]: 250.330 us
		 * * Diff: -1.724 %
		 */
		this.output.push(
			` * Current Branch [${this.currentBranch}]: ${this.formatScore(diff.scoreA)}`,
			` * Base Branch [${this.baseBranch}]: ${this.formatScore(diff.scoreB)}`,
			` * Diff: ${this.formatPercentage(diff.diff)}`,
		);
	}

	private renderTableDiff(diffs: BenchmarkDiff[]): void {
		/**
		 * | Benchmark  | Current Branch<br />[luan.try-out-new-benchmark] | Base Branch<br />[main] | Diff |
		 * | ------------- | -------- | -------- | -------- |
		 * | Bench1  | 246.015 us  | 250.330 us | - 1.724% |
		 * | Bench2  | 246.015 us  | 250.330 us | - 1.724% |
		 */
		this.output.push(
			this.tabulate([
				'Benchmarks',
				`Current Branch<br/>[${this.currentBranch}]`,
				`Base Branch<br/>[${this.baseBranch}]`,
				'Diff',
			]),
			this.tabulate(['-------------', '--------', '--------', '--------']),
		);
		for (const diff of diffs) {
			this.output.push(
				this.tabulate([
					diff.benchmark,
					this.formatScore(diff.scoreA),
					this.formatScore(diff.scoreB),
					this.formatPercentage(diff.diff),
				]),
			);
		}
	}

	private renderFinalMessage(): void {
		this.output.push(
			'---',
			'_Benchmarks provided with 💙 by [Dart Benchmark Action](https://github.com/luanpotter/dart-benchmark-action/)._',
			'',
		);
	}

	private computeDiffs(project: Project): BenchmarkDiff[] {
		return this.results.computeDiffs(
			project,
			this.currentBranch,
			this.baseBranch,
		);
	}

	private tabulate(cols: string[]): string {
		return `| ${cols.join(' | ')} |`;
	}

	private formatScore(score: number | undefined): string {
		if (score === undefined) {
			return '[-]';
		}
		return `${score.toFixed(3)} μs`;
	}

	private formatPercentage(diff: number | undefined): string {
		if (diff === undefined) {
			return '[-]';
		}

		// use emojis for up and down 🟢 🔴
		const emojiArrow = diff < 0 ? '🟢' : diff > 0 ? '🔴' : ' ';

		const diffSign = diff > 0 ? '+' : diff < 0 ? '-' : ' ';
		const diffValue = Math.abs(diff).toFixed(3);
		return `${emojiArrow} ${diffSign}${diffValue} %`;
	}
}
