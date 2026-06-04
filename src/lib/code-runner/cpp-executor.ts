/**
 * C++ execution via browsercc (WASM-compiled Clang + LLD)
 * Compiles source to WASM, then runs it with WASI shim for stdin/stdout.
 */

import type { ExecutionResult } from "@/lib/constants";

let compileModule: typeof import("browsercc") | null = null;
let wasiModule: typeof import("@bjorn3/browser_wasi_shim") | null = null;

async function loadModules() {
  if (!compileModule) compileModule = await import("browsercc");
  if (!wasiModule) wasiModule = await import("@bjorn3/browser_wasi_shim");

  return { compile: compileModule.compile, wasi: wasiModule };
}

export async function executeCpp(
  source: string,
  stdin: string,
  timeoutMs: number,
): Promise<ExecutionResult> {
  const startTime = performance.now();

  try {
    const { compile, wasi } = await loadModules();
    const { WASI, File, OpenFile, ConsoleStdout } = wasi;

    const { module, compileOutput } = await compile({
      source,
      fileName: "main.cpp",
      flags: ["-std=c++17", "-O2", "-fno-exceptions"],
    });

    if (!module) {
      return {
        stdout: "",
        stderr: compileOutput || "Compilation failed",
        exitCode: 1,
        executionTimeMs: Math.round(performance.now() - startTime),
      };
    }

    // Set up WASI with stdin/stdout/stderr
    const stdinBytes = new TextEncoder().encode(stdin);
    let stdout = "";
    let stderr = "";

    const fds = [
      new OpenFile(new File(stdinBytes)),
      new ConsoleStdout((data: Uint8Array) => {
        stdout += new TextDecoder().decode(data);
      }),
      new ConsoleStdout((data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      }),
    ];

    const wasiInstance = new WASI([], [], fds);

    // Run with timeout
    const runPromise = (async () => {
      const instance = await WebAssembly.instantiate(module, {
        wasi_snapshot_preview1: wasiInstance.wasiImport,
      });
      wasiInstance.start(instance as any);
    })();

    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), timeoutMs),
    );

    const result = await Promise.race([runPromise, timeoutPromise]);

    if (result === "timeout") {
      return {
        stdout,
        stderr: "Time Limit Exceeded",
        exitCode: 1,
        executionTimeMs: timeoutMs,
        timedOut: true,
      };
    }

    return {
      stdout,
      stderr,
      exitCode: 0,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    return {
      stdout: "",
      stderr: err instanceof Error ? err.message : "Runtime error",
      exitCode: 1,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  }
}
