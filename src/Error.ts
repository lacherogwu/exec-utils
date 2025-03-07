/**
 * Custom error class for exec-utils operations.
 * Extends the standard Error class with an additional code property
 * representing the process exit code or error status.
 *
 * @example
 * // Handle errors from process execution
 * const { error } = await spawn('command', ['arg']);
 * if (error) {
 *   console.log(`Command failed with code ${error.code}`);
 *   console.log(error.message); // Error message or stderr output
 * }
 */
export class ExecUtilsError extends Error {
	code: number;
	constructor(message: string, code: number) {
		super(message);
		this.name = 'ExecUtilsError';
		this.code = code;
	}
}
