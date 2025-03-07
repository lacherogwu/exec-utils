// src/index.ts
import childProcess from "node:child_process";
import { once } from "node:events";
import util from "node:util";

// src/Error.ts
var ExecUtilsError = class extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.name = "ExecUtilsError";
    this.code = code;
  }
};

// src/index.ts
function setupAbortHandling(options) {
  const abortController = new AbortController();
  let timeoutId;
  if (options.timeout) {
    timeoutId = setTimeout(() => {
      abortController.abort(new Error(`Command timed out after ${options.timeout}ms`));
    }, options.timeout);
  }
  const signal = options.signal ? AbortSignal.any([options.signal, abortController.signal]) : abortController.signal;
  return { signal, abortController, timeoutId };
}
function handleInput(child, input, abortController) {
  if (input === void 0 || !child.stdin) {
    return;
  }
  try {
    if (typeof input === "string") {
      child.stdin.write(Buffer.from(input, "utf8"));
      child.stdin.end();
    } else if (Buffer.isBuffer(input)) {
      child.stdin.write(input);
      child.stdin.end();
    } else if (typeof input.pipe === "function") {
      input.pipe(child.stdin);
      input.once("end", () => {
        child.stdin?.end();
      });
      input.once("error", (err) => {
        abortController.abort(new Error(`Input stream error: ${err.message}`));
      });
    }
  } catch (err) {
    child.stdin.end();
    abortController.abort(new Error(`Failed to write to stdin: ${err instanceof Error ? err.message : String(err)}`));
  }
}
function createResult(code, dataChunks, dataLength, errorChunks, errorLength, encoding, process) {
  if (code === 0) {
    const buffer = Buffer.concat(dataChunks, dataLength);
    return {
      data: buffer.toString(encoding),
      dataAsBuffer: buffer,
      error: null,
      process
    };
  } else {
    const errorBuffer = Buffer.concat(errorChunks, errorLength);
    const errorStr = errorBuffer.toString("utf8");
    const execError = new ExecUtilsError(errorStr, code);
    return {
      data: null,
      dataAsBuffer: null,
      error: execError,
      process
    };
  }
}
function createErrorResult(err, signal, process) {
  let execError = err instanceof Error ? new ExecUtilsError(err.message, -1) : new ExecUtilsError("Unknown error occurred", -1);
  if (signal.aborted) {
    execError = signal.reason instanceof Error ? new ExecUtilsError(signal.reason.message, -1) : new ExecUtilsError("Operation aborted", -1);
  }
  return {
    data: null,
    dataAsBuffer: null,
    error: execError,
    process
  };
}
async function spawn(command, args, options = {}) {
  const encoding = options.encoding || "utf8";
  const maxBuffer = options.maxBuffer || 80 * 1024 * 1024;
  const { signal, abortController, timeoutId } = setupAbortHandling(options);
  const spawnOptions = { ...options };
  delete spawnOptions.timeout;
  delete spawnOptions.maxBuffer;
  delete spawnOptions.encoding;
  delete spawnOptions.input;
  const child = childProcess.spawn(command, args, spawnOptions);
  handleInput(child, options.input, abortController);
  const dataChunks = [];
  let dataLength = 0;
  let errorChunks = [];
  let errorLength = 0;
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
  signal.addEventListener(
    "abort",
    () => {
      cleanup();
      child.kill("SIGTERM");
    },
    { once: true }
  );
  child.stdout?.on("data", (chunk) => {
    dataChunks.push(chunk);
    dataLength += chunk.length;
    if (dataLength > maxBuffer) {
      abortController.abort(new Error(`MaxBuffer size exceeded (${maxBuffer} bytes)`));
    }
  });
  child.stderr?.on("data", (chunk) => {
    errorChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    errorLength += Buffer.isBuffer(chunk) ? chunk.length : String(chunk).length;
    if (dataLength + errorLength > maxBuffer) {
      abortController.abort(new Error(`MaxBuffer size exceeded (${maxBuffer} bytes)`));
    }
  });
  try {
    const [code] = await once(child, "close");
    if (signal.aborted) {
      throw signal.reason;
    }
    cleanup();
    return createResult(code, dataChunks, dataLength, errorChunks, errorLength, encoding, child);
  } catch (err) {
    cleanup();
    return createErrorResult(err, signal, child);
  }
}
async function exec(command, options = {}) {
  const encoding = options.encoding || "utf8";
  const maxBuffer = options.maxBuffer || 80 * 1024 * 1024;
  if (options.input !== void 0) {
    return spawn("sh", ["-c", command], {
      ...options,
      shell: true
    });
  }
  const { signal, timeoutId } = setupAbortHandling(options);
  const execOptions = { ...options, encoding: "buffer", maxBuffer };
  delete execOptions.timeout;
  delete execOptions.signal;
  const execAsync = util.promisify(childProcess.exec);
  const execPromise = execAsync(command, execOptions);
  const childProc = execPromise.child;
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
  signal.addEventListener(
    "abort",
    () => {
      cleanup();
      childProc.kill("SIGTERM");
    },
    { once: true }
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
      process: childProc
    };
  } catch (err) {
    cleanup();
    return createErrorResult(err, signal, childProc);
  }
}
export {
  ExecUtilsError,
  exec,
  spawn
};
