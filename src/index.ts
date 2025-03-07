import childProcess from 'node:child_process';
import { once } from 'node:events';
import util from 'node:util';
import { ExecUtilsError } from './Error';
import type { BaseOptions, SpawnResult, SpawnOptions, ExecOptions } from './types';

export * from './types';
export { ExecUtilsError } from './Error';

/**
 * Sets up abort handling with timeout support and signal combining
 */
function setupAbortHandling(options: BaseOptions) {
	const abortController = new AbortController();
	let timeoutId: NodeJS.Timeout | undefined;

	if (options.timeout) {
		timeoutId = setTimeout(() => {
			abortController.abort(new Error(`Command timed out after ${options.timeout}ms`));
		}, options.timeout);
	}

	const signal = options.signal ? AbortSignal.any([options.signal, abortController.signal]) : abortController.signal;

	return { signal, abortController, timeoutId };
}

/**
 * Handles writing input to child process stdin
 */
function handleInput(child: childProcess.ChildProcess, input: string | Buffer | NodeJS.ReadableStream | undefined, abortController: AbortController) {
	if (input === undefined || !child.stdin) {
		return;
	}

	try {
		if (typeof input === 'string') {
			child.stdin.write(Buffer.from(input, 'utf8'));
			child.stdin.end();
		} else if (Buffer.isBuffer(input)) {
			child.stdin.write(input);
			child.stdin.end();
		} else if (typeof input.pipe === 'function') {
			input.pipe(child.stdin);
			input.once('end', () => {
				child.stdin?.end();
			});
			input.once('error', err => {
				abortController.abort(new Error(`Input stream error: ${err.message}`));
			});
		}
	} catch (err) {
		child.stdin.end();
		abortController.abort(new Error(`Failed to write to stdin: ${err instanceof Error ? err.message : String(err)}`));
	}
}

/**
 * Creates a result object from process execution
 */
function createResult(code: number, dataChunks: Buffer[], dataLength: number, errorChunks: Buffer[], errorLength: number, encoding: BufferEncoding, process: childProcess.ChildProcess): SpawnResult {
	if (code === 0) {
		const buffer = Buffer.concat(dataChunks, dataLength);
		return {
			data: buffer.toString(encoding),
			dataAsBuffer: buffer,
			error: null,
			code,
			process,
		};
	} else {
		const errorBuffer = Buffer.concat(errorChunks, errorLength);
		const errorStr = errorBuffer.toString('utf8');
		const execError = new ExecUtilsError(errorStr, code);
		return {
			data: null,
			dataAsBuffer: null,
			error: execError,
			code,
			process,
		};
	}
}

/**
 * Creates an error result when execution fails
 */
function createErrorResult(err: unknown, signal: AbortSignal, process: childProcess.ChildProcess): SpawnResult {
	let execError = err instanceof Error ? new ExecUtilsError(err.message, -1) : new ExecUtilsError('Unknown error occurred', -1);
	if (signal.aborted) {
		execError = signal.reason instanceof Error ? new ExecUtilsError(signal.reason.message, -1) : new ExecUtilsError('Operation aborted', -1);
	}

	return {
		data: null,
		dataAsBuffer: null,
		error: execError,
		code: -1,
		process,
	};
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
export async function spawn(command: string, args: readonly string[], options: SpawnOptions = {}): Promise<SpawnResult> {
	const encoding = options.encoding || 'utf8';
	const maxBuffer = options.maxBuffer || 80 * 1024 * 1024; // 80MB default

	const { signal, abortController, timeoutId } = setupAbortHandling(options);

	const spawnOptions = { ...options };
	delete spawnOptions.timeout;
	delete spawnOptions.maxBuffer;
	delete spawnOptions.encoding;
	delete spawnOptions.input;

	const child = childProcess.spawn(command, args, spawnOptions);

	handleInput(child, options.input, abortController);

	const dataChunks: Buffer[] = [];
	let dataLength = 0;
	let errorChunks: Buffer[] = [];
	let errorLength = 0;

	const cleanup = () => {
		if (timeoutId) clearTimeout(timeoutId);
	};

	signal.addEventListener(
		'abort',
		() => {
			cleanup();
			child.kill('SIGTERM');
		},
		{ once: true },
	);

	child.stdout?.on('data', chunk => {
		dataChunks.push(chunk);
		dataLength += chunk.length;

		if (dataLength > maxBuffer) {
			abortController.abort(new Error(`MaxBuffer size exceeded (${maxBuffer} bytes)`));
		}
	});

	child.stderr?.on('data', chunk => {
		errorChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
		errorLength += Buffer.isBuffer(chunk) ? chunk.length : String(chunk).length;

		if (dataLength + errorLength > maxBuffer) {
			abortController.abort(new Error(`MaxBuffer size exceeded (${maxBuffer} bytes)`));
		}
	});

	try {
		const [code] = await once(child, 'close');

		if (signal.aborted) {
			throw signal.reason;
		}

		cleanup();
		return createResult(code, dataChunks, dataLength, errorChunks, errorLength, encoding, child);
	} catch (err: unknown) {
		cleanup();
		return createErrorResult(err, signal, child);
	}
}

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
export async function exec(command: string, options: ExecOptions = {}): Promise<SpawnResult> {
	const encoding = options.encoding || 'utf8';
	const maxBuffer = options.maxBuffer || 80 * 1024 * 1024; // 80MB default

	if (options.input !== undefined) {
		return spawn('sh', ['-c', command], {
			...options,
			shell: true,
		});
	}

	const { signal, timeoutId } = setupAbortHandling(options);

	const execOptions = { ...options, encoding: 'buffer' as const, maxBuffer };
	delete execOptions.timeout;
	delete execOptions.signal;

	const execAsync = util.promisify(childProcess.exec);

	const execPromise = execAsync(command, execOptions);
	const childProc = execPromise.child;

	const cleanup = () => {
		if (timeoutId) clearTimeout(timeoutId);
	};

	signal.addEventListener(
		'abort',
		() => {
			cleanup();
			childProc.kill('SIGTERM');
		},
		{ once: true },
	);

	try {
		const { stdout } = await execPromise;

		if (signal.aborted) {
			throw signal.reason;
		}

		cleanup();
		return {
			data: stdout.toString(encoding),
			dataAsBuffer: stdout,
			error: null,
			code: 0,
			process: childProc,
		};
	} catch (err: unknown) {
		cleanup();
		return createErrorResult(err, signal, childProc);
	}
}
