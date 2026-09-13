const childProcess = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

const { assertNotAborted, mediaError } = require('./mediaPath');

const FFPROBE_TIMEOUT_MS = 10000;
const FFPROBE_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const activeCommands = new Map();
const activeProbes = new Map();

const createForcedStopError = () => {
  const error = new Error('Analysis media processing stopped during shutdown');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
};

const resolveFfprobePath = () =>
  new Promise((resolve, reject) => {
    ffmpeg()._getFfprobePath((error, executablePath) => {
      if (error) reject(error);
      else if (!executablePath) reject(mediaError('AI_ANALYSIS_MEDIA_PROBE_UNAVAILABLE'));
      else resolve(executablePath);
    });
  });

const probeMediaFile = async (filePath, { signal, timeoutMs = FFPROBE_TIMEOUT_MS } = {}) => {
  assertNotAborted(signal);
  const executablePath = await resolveFfprobePath();
  assertNotAborted(signal);

  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(
      executablePath,
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stdoutBytes = 0;
    let completionReason = null;
    let settled = false;
    let resolveCompletion;
    const completion = new Promise((done) => {
      resolveCompletion = done;
    });

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      activeProbes.delete(child);
      resolveCompletion();
      if (error) reject(error);
      else resolve(value);
    };
    const requestStop = (reason) => {
      if (completionReason) return;
      completionReason = reason;
      try {
        child.kill('SIGKILL');
      } catch (_error) {
        finish(reason);
      }
    };
    const onAbort = () => {
      try {
        assertNotAborted(signal);
      } catch (error) {
        requestStop(error);
      }
    };
    const timeout = setTimeout(
      () => requestStop(mediaError('AI_ANALYSIS_MEDIA_PROBE_TIMEOUT')),
      timeoutMs
    );

    activeProbes.set(child, { completion, requestStop });
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > FFPROBE_MAX_OUTPUT_BYTES) {
        requestStop(mediaError('AI_ANALYSIS_MEDIA_PROBE_INVALID'));
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.resume();
    child.once('error', () => finish(completionReason || mediaError('AI_ANALYSIS_MEDIA_PROBE_FAILED')));
    child.once('close', (code, closeSignal) => {
      if (completionReason) return finish(completionReason);
      if (code !== 0 || closeSignal) return finish(mediaError('AI_ANALYSIS_MEDIA_PROBE_FAILED'));
      try {
        return finish(null, JSON.parse(stdout));
      } catch (_error) {
        return finish(mediaError('AI_ANALYSIS_MEDIA_PROBE_INVALID'));
      }
    });
  });
};

const runFfmpegCommand = (command, { signal, start = (entry) => entry.run() } = {}) =>
  new Promise((resolve, reject) => {
    assertNotAborted(signal);
    let settled = false;
    let completionReason = null;
    let resolveCompletion;
    const completion = new Promise((done) => {
      resolveCompletion = done;
    });

    const finish = (error) => {
      if (settled) return;
      settled = true;
      activeCommands.delete(command);
      resolveCompletion();
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const requestStop = (reason) => {
      if (completionReason) return;
      completionReason = reason;
      try {
        command.kill('SIGKILL');
      } catch (_error) {
        finish(reason);
      }
    };
    const onAbort = () => {
      try {
        assertNotAborted(signal);
      } catch (error) {
        requestStop(error);
      }
    };

    command.once('end', () => finish(completionReason));
    command.once('error', (error) => {
      finish(completionReason || error);
    });
    activeCommands.set(command, { completion, requestStop });
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      start(command);
    } catch (error) {
      finish(error);
    }
  });

const abortActiveFfmpegCommands = async () => {
  const entries = [...activeCommands.values()];
  for (const { requestStop } of entries) {
    requestStop(createForcedStopError());
  }
  await Promise.allSettled(entries.map(({ completion }) => completion));
};

const abortActiveFfprobeProcesses = async () => {
  const entries = [...activeProbes.values()];
  for (const { requestStop } of entries) {
    requestStop(createForcedStopError());
  }
  await Promise.allSettled(entries.map(({ completion }) => completion));
};

const abortActiveMediaProcesses = () =>
  Promise.allSettled([abortActiveFfmpegCommands(), abortActiveFfprobeProcesses()]);

const getActiveFfmpegCommandCount = () => activeCommands.size + activeProbes.size;

module.exports = {
  FFPROBE_TIMEOUT_MS,
  abortActiveFfmpegCommands,
  abortActiveFfprobeProcesses,
  abortActiveMediaProcesses,
  getActiveFfmpegCommandCount,
  probeMediaFile,
  runFfmpegCommand,
};
