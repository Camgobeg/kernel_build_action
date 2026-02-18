import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Execute command with sudo if not running as root
 */
export async function sudoExec(
  command: string,
  args: string[],
  options?: exec.ExecOptions
): Promise<number> {
  const isRoot = process.getuid && process.getuid() === 0;
  if (isRoot) {
    return await exec.exec(command, args, options);
  } else {
    return await exec.exec('sudo', [command, ...args], options);
  }
}

/**
 * Detect package manager (apt or pacman)
 */
export function detectPackageManager(): string {
  if (fs.existsSync('/bin/apt') || fs.existsSync('/usr/bin/apt')) {
    return 'apt';
  }
  if (fs.existsSync('/bin/pacman') || fs.existsSync('/usr/bin/pacman')) {
    return 'pacman';
  }
  return 'unknown';
}

/**
 * Check if running in GitHub Actions Linux environment
 */
export function checkEnvironment(): void {
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const osType = process.platform;
  const pkgMgr = detectPackageManager();

  if (!isGitHubActions || osType !== 'linux' || pkgMgr === 'unknown') {
    throw new Error(
      `This action requires GitHub Actions Linux runners (Debian-based or ArchLinux-based). ` +
        `Current: platform=${osType}, GITHUB_ACTIONS=${process.env.GITHUB_ACTIONS}`
    );
  }
}

/**
 * Install system dependencies
 */
export async function installDependencies(): Promise<void> {
  const pkgMgr = detectPackageManager();
  core.startGroup('Installing dependency packages');

  if (pkgMgr === 'apt') {
    await sudoExec('apt-get', ['update']);
    await sudoExec('apt-get', [
      'install',
      '--no-install-recommends',
      '-y',
      'binutils',
      'git',
      'make',
      'bc',
      'bison',
      'openssl',
      'curl',
      'zip',
      'kmod',
      'cpio',
      'flex',
      'libelf-dev',
      'libssl-dev',
      'libtfm-dev',
      'libc6-dev',
      'device-tree-compiler',
      'ca-certificates',
      'python3',
      'xz-utils',
      'aria2',
      'build-essential',
      'ccache',
      'pigz',
      'parallel',
      'jq',
      'opam',
      'libpcre3-dev',
    ]);
  } else if (pkgMgr === 'pacman') {
    await sudoExec('pacman', ['-Syyu', '--noconfirm']);
    await sudoExec('pacman', [
      '-S',
      '--noconfirm',
      'git',
      'base-devel',
      'opam',
      'aria2',
      'python3',
      'ccache',
      'pigz',
      'parallel',
      'jq',
      'pcre2',
    ]);
  }

  core.endGroup();
}

/**
 * Install clang and binutils from system
 */
export async function installSystemClang(): Promise<void> {
  const pkgMgr = detectPackageManager();

  if (pkgMgr === 'apt') {
    await sudoExec('apt-get', ['install', '-y', 'clang', 'lld']);
    await sudoExec('apt-get', [
      'install',
      '-y',
      'binutils-aarch64-linux-gnu',
      'binutils-arm-linux-gnueabihf',
    ]);
  } else if (pkgMgr === 'pacman') {
    await sudoExec('pacman', ['-S', '--noconfirm', 'clang', 'lld', 'llvm']);
  }
}

/**
 * Get action path
 */
export function getActionPath(): string {
  return process.env.GITHUB_ACTION_PATH || path.join(__dirname, '..');
}

/**
 * Parse extra make arguments from JSON string
 */
export function parseExtraMakeArgs(jsonStr: string): string[] {
  try {
    const args = JSON.parse(jsonStr);
    if (Array.isArray(args)) {
      return args;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Filter out dangerous make arguments
 */
export function filterMakeArgs(args: string[]): string[] {
  const dangerous = [
    'CC=',
    'CXX=',
    'LD=',
    'AS=',
    'AR=',
    'NM=',
    'STRIP=',
    'OBJCOPY=',
    'OBJDUMP=',
    'HOSTCC=',
    'KBUILD_HOSTCC=',
    'SHELL=',
    'MAKEFLAGS=',
    'MAKE=',
    'CROSS_COMPILE=',
    'CLANG_TRIPLE=',
    'LLVM=',
    'CLVM=',
    'O=',
    'ARCH=',
  ];

  return args.filter((arg) => {
    for (const prefix of dangerous) {
      if (arg.startsWith(prefix)) {
        core.warning(`Ignoring override of critical variable: ${arg}`);
        return false;
      }
    }
    return true;
  });
}

/**
 * Detect host architecture
 */
export function detectHostArch(): string {
  const arch = process.arch;
  switch (arch) {
    case 'arm':
    case 'arm64':
      return 'arm';
    case 'x64':
      return 'x86_64';
    default:
      return arch;
  }
}

/**
 * Check if directory exists
 */
export function dirExists(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Read file content
 */
export function readFile(filePath: string): string {
  if (!fileExists(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write file content
 */
export function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Append to file
 */
export function appendFile(filePath: string, content: string): void {
  fs.appendFileSync(filePath, content, 'utf-8');
}

/**
 * Remove directory recursively
 */
export function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Copy directory recursively
 */
export function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Find files matching pattern
 */
export function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}
