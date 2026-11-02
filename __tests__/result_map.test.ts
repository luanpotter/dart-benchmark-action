import { jest } from '@jest/globals';

const info = jest.fn<(message: string) => void>();
const warning = jest.fn<(message: string) => void>();
jest.unstable_mockModule('@actions/core', () => ({ info, warning }));

const { BenchmarkResults } = await import('../src/result_map.js');

describe('BenchmarkResults', () => {
	it('parses the benchmark lines, whatever their names', () => {
		const results = BenchmarkResults.success(
			[
				'Compiling...',
				'Simple(RunTime): 1.5 us.',
				'  Indented(RunTime): 2 us.  ',
				'With: colon(RunTime): 3 us.',
				'With (parens)(RunTime): 4e2 us.',
				'NotABenchmark: 5 us.',
			].join('\n'),
		);

		expect(results.scores()).toEqual({
			Simple: 1.5,
			Indented: 2,
			'With: colon': 3,
			'With (parens)': 400,
		});
		expect(warning).not.toHaveBeenCalled();
	});

	it('leaves out what the reporter would refuse, and keeps the rest', () => {
		const longName = 'a'.repeat(150);

		const results = BenchmarkResults.success(
			[
				'Good(RunTime): 1 us.',
				'NotNumber(RunTime): abc us.',
				'Infinite(RunTime): Infinity us.',
				'Negative(RunTime): -1 us.',
				'__proto__(RunTime): 1 us.',
				'constructor(RunTime): 1 us.',
				`${longName}(RunTime): 2 us.`,
			].join('\n'),
		);

		expect(Object.keys(results.scores())).toEqual(['Good', 'a'.repeat(100)]);
		expect(warning).toHaveBeenCalledTimes(5);
	});
});
