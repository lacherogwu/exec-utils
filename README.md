# exec-utils

A modern, promise-based utility package for Node.js that provides enhanced child process execution with robust error handling, timeouts, and input streaming support.

## Description

exec-utils wraps Node.js child process functions with additional features that make command execution more reliable and convenient:

- **Promise-based API** - Clean async/await pattern for process execution
- **Timeout support** - Automatically kill long-running processes
- **AbortSignal integration** - Cancel operations from outside
- **Input streaming** - Easily pipe data to child processes
- **Unified error handling** - Consistent error format with exit codes
- **Buffer size limits** - Prevent memory issues with large outputs
- **Configurable encoding** - Control output encoding
- **Typescript support** - Full type definitions included

## Installation

### NPM

```bash
npm i exec-utils
```

### GitHub

```bash
npm i https://github.com/lacherogwu/exec-utils
```

## Requirements

- Node.js 16 or higher

## Usage

### Basic Usage

```typescript
import { spawn, exec } from 'exec-utils';

// Using spawn for commands with arguments
const { data } = await spawn('echo', ['Hello', 'World']);
console.log(data); // 'Hello World\n'

// Using exec for shell commands
const { data: execData } = await exec('echo "Hello World"');
console.log(execData); // 'Hello World\n'
```

### With Timeout

```typescript
// Kill process after 5 seconds
const { error } = await spawn('sleep', ['10'], { timeout: 5000 });
if (error) {
	console.log(error.message); // "Command timed out after 5000ms"
	console.log(error.code); // -1
}
```

### With Input

```typescript
// Provide input to a command
const { data } = await spawn('grep', ['good'], {
	input: 'no errors here\nthis line has an error\nall good',
});
console.log(data); // 'all good\n'

// JSON processing with jq
const { data: jsonData } = await spawn('jq', ['.name'], {
	input: JSON.stringify({ name: 'John', age: 30 }),
});
console.log(jsonData.trim()); // '"John"'
```

### With AbortController

```typescript
// Cancel execution from outside
const controller = new AbortController();
const { signal } = controller;

// Start a process
const processPromise = spawn('sleep', ['10'], { signal });

// Cancel it after 2 seconds
setTimeout(() => {
	controller.abort();
}, 2000);

const { error } = await processPromise;
if (error) {
	console.log(error.message); // "Operation aborted"
	console.log(error.code); // -1
}
```

### Error Handling

```typescript
// Handle errors and non-zero exit codes
const { error, data } = await spawn('ls', ['non-existent-directory']);

if (error) {
	console.error(`Command failed with code ${error.code}`);
	console.error(error.message); // Contains stderr output
} else {
	console.log(data);
}
```

## API

### `spawn(command: string, args: string[], options?: SpawnOptions): Promise<CommandResult>`

Executes a command with arguments.

- **Parameters:**
  - `command`: Command to execute
  - `args`: Array of arguments
  - `options`: Optional configuration object
- **Returns:**
  - Promise resolving to a `CommandResult` object

### `exec(command: string, options?: ExecOptions): Promise<CommandResult>`

Executes a shell command.

- **Parameters:**
  - `command`: Shell command to execute
  - `options`: Optional configuration object
- **Returns:**
  - Promise resolving to a `CommandResult` object

### Options

```typescript
interface SpawnOptions {
	// Timeout in milliseconds
	timeout?: number;

	// Maximum buffer size in bytes (default: 80MB)
	maxBuffer?: number;

	// Output encoding (default: 'utf8')
	encoding?: BufferEncoding;

	// AbortSignal for cancellation
	signal?: AbortSignal;

	// Data to write to stdin
	input?: string | Buffer | NodeJS.ReadableStream;

	// Plus all Node.js child_process.SpawnOptions
}

interface ExecOptions {
	// Same as SpawnOptions plus all Node.js child_process.ExecOptions
}
```

### Result Object

```typescript
type CommandResult =
	| {
			// Process succeeded
			data: string; // Process output as string
			dataAsBuffer: Buffer; // Raw output buffer
			error: null; // No error
			process: ChildProcess; // Process reference
	  }
	| {
			// Process failed
			data: null; // No data
			dataAsBuffer: null; // No data buffer
			error: ExecUtilsError; // Error with message and code
			process: ChildProcess; // Process reference
	  };
```

## License

MIT
