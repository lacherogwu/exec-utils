import type { ChildProcess, SpawnOptions as SpawnOptions_, ExecOptions as ExecOptions_ } from 'node:child_process';
import type { ExecUtilsError } from './Error';

export type SpawnResult =
	| (
			| {
					data: string;
					dataAsBuffer: Buffer;
					error: null;
			  }
			| {
					data: null;
					dataAsBuffer: null;
					error: ExecUtilsError;
			  }
	  ) & {
			code: number;
			process: ChildProcess;
	  };

export interface BaseOptions {
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

export interface SpawnOptions extends BaseOptions, SpawnOptions_ {}
export interface ExecOptions extends BaseOptions, ExecOptions_ {}
