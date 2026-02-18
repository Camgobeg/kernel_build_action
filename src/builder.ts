import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolchainPaths } from './toolchain';
import { filterMakeArgs, parseExtraMakeArgs } from './utils';

export interface BuildConfig {
  kernelDir: string;
  arch: string;
  config: string;
  toolchain: ToolchainPaths;
  extraMakeArgs: string;
  useCcache: boolean;
}

/**
 * Build the kernel
 */
export async function buildKernel(config: BuildConfig): Promise<boolean> {
  core.startGroup('Building Kernel with selected cross compiler');

  // Validate config doesn't start with hyphen to prevent command injection
  if (config.config.startsWith('-')) {
    throw new Error('config input must not start with a hyphen');
  }

  // Validate arch matches expected patterns to prevent command injection
  const validArchs = ['arm', 'arm64', 'x86', 'x86_64', 'riscv', 'riscv64', 'mips', 'mips64'];
  if (!validArchs.includes(config.arch)) {
    throw new Error(`Invalid architecture: ${config.arch}. Valid options: ${validArchs.join(', ')}`);
  }

  const outDir = path.join(config.kernelDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  // Prepare environment
  const env: { [key: string]: string } = { ...process.env } as { [key: string]: string };

  // Setup compiler
  let cmdCc: string;
  let cmdCrossCompile: string | undefined;
  let cmdCrossCompileArm32: string | undefined;
  let cmdClangTriple: string;

  if (config.toolchain.clangPath) {
    // Use Clang
    cmdCc = path.join(config.toolchain.clangPath, 'bin', 'clang');
    core.addPath(path.join(config.toolchain.clangPath, 'bin'));

    if (config.toolchain.gcc64Path || config.toolchain.gcc32Path) {
      if (config.toolchain.gcc64Path && config.toolchain.gcc64Prefix) {
        cmdCrossCompile = path.join(
          config.toolchain.gcc64Path,
          'bin',
          `${config.toolchain.gcc64Prefix}-`
        );
      }
      if (config.toolchain.gcc32Path && config.toolchain.gcc32Prefix) {
        cmdCrossCompileArm32 = path.join(
          config.toolchain.gcc32Path,
          'bin',
          `${config.toolchain.gcc32Prefix}-`
        );
      }
    }
  } else if (config.toolchain.gcc64Path || config.toolchain.gcc32Path) {
    // Use GCC only
    if (config.toolchain.gcc64Path && config.toolchain.gcc64Prefix) {
      cmdCc = path.join(config.toolchain.gcc64Path, 'bin', `${config.toolchain.gcc64Prefix}-gcc`);
      cmdCrossCompile = `${config.toolchain.gcc64Prefix}-`;
      core.addPath(path.join(config.toolchain.gcc64Path, 'bin'));
    } else if (config.toolchain.gcc32Path && config.toolchain.gcc32Prefix) {
      cmdCc = path.join(config.toolchain.gcc32Path, 'bin', `${config.toolchain.gcc32Prefix}-gcc`);
      cmdCrossCompile = `${config.toolchain.gcc32Prefix}-`;
      core.addPath(path.join(config.toolchain.gcc32Path, 'bin'));
    } else {
      cmdCc = '/usr/bin/gcc';
    }

    if (config.toolchain.gcc32Path && config.toolchain.gcc32Prefix) {
      cmdCrossCompileArm32 = `${config.toolchain.gcc32Prefix}-`;
      core.addPath(path.join(config.toolchain.gcc32Path, 'bin'));
    }
  } else {
    // System toolchain
    cmdCc = '/usr/bin/clang';
    cmdCrossCompile = '/usr/bin/aarch64-linux-gnu-';
    cmdCrossCompileArm32 = 'arm-linux-gnueabihf-';
  }

  // Setup CLANG_TRIPLE
  if (config.arch === 'arm') {
    cmdClangTriple = cmdCrossCompileArm32 || 'arm-linux-gnueabihf-';
  } else {
    cmdClangTriple = 'aarch64-linux-gnu-';
  }

  // Add ccache to path if enabled
  if (config.useCcache) {
    env.USE_CCACHE = '1';
    core.addPath('/usr/lib/ccache');
  }

  // Parse extra make arguments
  const extraArgs = parseExtraMakeArgs(config.extraMakeArgs);
  const safeExtraArgs = filterMakeArgs(extraArgs);

  // Build make arguments
  const makeArgs = [
    `-j${os.cpus().length}`,
    config.config,
    `ARCH=${config.arch}`,
    'O=out',
    'all',
    ...safeExtraArgs,
  ];

  core.info(`CC: ${cmdCc}`);
  core.info(`CROSS_COMPILE: ${cmdCrossCompile || 'not set'}`);
  core.info(`CROSS_COMPILE_ARM32: ${cmdCrossCompileArm32 || 'not set'}`);
  core.info(`CLANG_TRIPLE: ${cmdClangTriple}`);
  core.info(`Make args: ${makeArgs.join(' ')}`);

  // Run make
  const logFile = path.join(outDir, 'build.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const makeEnv = {
    ...env,
    CC: cmdCc,
    CROSS_COMPILE: cmdCrossCompile || '',
    CROSS_COMPILE_ARM32: cmdCrossCompileArm32 || '',
    CLANG_TRIPLE: cmdClangTriple,
  };

  let exitCode = 0;
  try {
    exitCode = await exec.exec('make', makeArgs, {
      cwd: config.kernelDir,
      env: makeEnv,
      listeners: {
        stdout: (data: Buffer) => {
          logStream.write(data);
          process.stdout.write(data);
        },
        stderr: (data: Buffer) => {
          logStream.write(data);
          process.stderr.write(data);
        },
      },
    });
  } catch (error) {
    exitCode = 1;
  } finally {
    logStream.end();
  }

  core.endGroup();

  return exitCode === 0;
}

/**
 * Check if kernel build was successful
 */
export function isBuildSuccessful(kernelDir: string, arch: string): boolean {
  const bootDir = path.join(kernelDir, 'out', 'arch', arch, 'boot');

  if (!fs.existsSync(bootDir)) {
    return false;
  }

  const entries = fs.readdirSync(bootDir);

  // Check for Image or Image.*
  return entries.some((entry) => entry.startsWith('Image'));
}
