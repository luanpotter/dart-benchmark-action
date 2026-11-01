import * as core from '@actions/core';

export function logError(error: unknown, message: string): void {
	if (error instanceof Error) {
		core.error(`+ ${message}: ${error.message}`);
	} else {
		// we cannot log an "unknown" error because typescript...
		core.error(`+ ${message}: [CATASTROPHIC ERROR]`);
	}
}
