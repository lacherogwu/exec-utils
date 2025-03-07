import { SpawnOptions as SpawnOptions$1, ChildProcess, ExecOptions as ExecOptions$1 } from 'node:child_process';

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
declare class ExecUtilsError extends Error {
    code: number;
    constructor(message: string, code: number);
}

type SpawnResult = ({
    data: string;
    dataAsBuffer: Buffer;
    error: null;
} | {
    data: null;
    dataAsBuffer: null;
    error: ExecUtilsError;
}) & {
    code: number;
    process: ChildProcess;
};
interface BaseOptions {
    /**
     * Timeout in milliseconds. If the process takes longer than this,
     * it will be killed and an error will be thrown.
     */
    timeout?: number;
    /**
     * Maximum buffer size in bytes. Default is 80MB.
     * If stdout exceeds this limit, the process will be killed.
     */
    maxBuffer?: number;
    /**
     * Encoding to use for converting output to string. Default is 'utf8'.
     */
    encoding?: BufferEncoding;
    /**
     * AbortSignal to cancel the operation.
     */
    signal?: AbortSignal;
    /**
     * Data to write to the child process's stdin.
     * Can be a string, Buffer, or Readable stream.
     */
    input?: string | Buffer | NodeJS.ReadableStream;
}
interface SpawnOptions extends BaseOptions, SpawnOptions$1 {
}
interface ExecOptions extends BaseOptions, ExecOptions$1 {
}

/**
 * Executes a command with arguments as a child process.
 *
 * @param command - The command to execute
 * @param args - Array of arguments to pass to the command
 * @param options - Optional configuration object
 * @returns A promise that resolves to a SpawnResult object containing either the command output or error information
 *
 * @example
 * // Basic usage
 * const { data } = await spawn('echo', ['Hello', 'World']);
 * console.log(data); // 'Hello World\n'
 *
 * // With timeout
 * const { error, code } = await spawn('sleep', ['10'], { timeout: 5000 });
 * if (error) {
 *   console.log(error.message); // "Command timed out after 5000ms"
 * }
 *
 * // With input
 * const { data } = await spawn('grep', ['error'], {
 *   input: 'line 1\nline with error\nline 3',
 * });
 * console.log(data); // 'line with error\n'
 *
 * // With AbortController
 * const controller = new AbortController();
 * const processPromise = spawn('sleep', ['10'], { signal: controller.signal });
 * controller.abort(); // Cancel the operation
 * const { error } = await processPromise;
 */
declare function spawn(command: string, args: readonly string[], options?: SpawnOptions): Promise<SpawnResult>;
/**
 * Executes a shell command as a child process.
 *
 * Similar to spawn() but runs the command in a shell, allowing for
 * shell features like pipes, redirects, and glob patterns.
 *
 * @param command - The shell command to execute
 * @param options - Optional configuration object
 * @returns A promise that resolves to a SpawnResult object containing either the command output or error information
 *
 * @example
 * // Basic usage
 * const { data } = await exec('echo "Hello World"');
 * console.log(data); // 'Hello World\n'
 *
 * // With timeout
 * const { error } = await exec('sleep 10', { timeout: 5000 });
 * if (error) {
 *   console.log(error.message); // "Command timed out after 5000ms"
 * }
 *
 * // With input (uses spawn internally)
 * const { data } = await exec('grep error', {
 *   input: 'line 1\nline with error\nline 3',
 * });
 * console.log(data); // 'line with error\n'
 *
 * // Process JSON with jq
 * const { data } = await exec('jq .name', {
 *   input: JSON.stringify({ name: "John", age: 30 }),
 * });
 * console.log(data.trim()); // '"John"'
 */
declare function exec(command: string, options?: ExecOptions): Promise<SpawnResult>;

export { type BaseOptions, type ExecOptions, ExecUtilsError, type SpawnOptions, type SpawnResult, exec, spawn };
