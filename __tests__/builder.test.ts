import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BuildConfig, buildKernel, isBuildSuccessful } from '../src/builder';
import * as fs from 'fs';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

// Mock dependencies
vi.mock('fs');
vi.mock('@actions/core');
vi.mock('@actions/exec');

beforeEach(() => {
  vi.clearAllMocks();
});

// We test the BuildConfig interface and validation logic
describe('BuildConfig interface', () => {
  it('accepts valid build config', () => {
    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {
        clangPath: '/clang',
        gcc64Path: '/gcc-64',
        gcc32Path: '/gcc-32',
        gcc64Prefix: 'aarch64-linux-android-4.9',
        gcc32Prefix: 'arm-linux-androideabi-4.9',
      },
      extraMakeArgs: '["-j8"]',
      useCcache: true,
    };

    expect(config.kernelDir).toBe('/kernel');
    expect(config.arch).toBe('arm64');
    expect(config.config).toBe('defconfig');
  });

  it('accepts minimal build config', () => {
    const config: BuildConfig = {
      kernelDir: 'kernel',
      arch: 'arm',
      config: 'minimal_defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    expect(config.arch).toBe('arm');
    expect(config.useCcache).toBe(false);
  });

  it('accepts x86_64 arch', () => {
    const config: BuildConfig = {
      kernelDir: 'kernel',
      arch: 'x86_64',
      config: 'x86_64_defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    expect(config.arch).toBe('x86_64');
  });

  it('accepts riscv64 arch', () => {
    const config: BuildConfig = {
      kernelDir: 'kernel',
      arch: 'riscv64',
      config: 'riscv64_defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    expect(config.arch).toBe('riscv64');
  });

  it('validates arch property', () => {
    const validArchs = ['arm', 'arm64', 'x86', 'x86_64', 'riscv', 'riscv64', 'mips', 'mips64'];

    for (const arch of validArchs) {
      const config: BuildConfig = {
        kernelDir: 'kernel',
        arch,
        config: 'defconfig',
        toolchain: {},
        extraMakeArgs: '',
        useCcache: false,
      };
      expect(config.arch).toBe(arch);
    }
  });
});

describe('BuildConfig security', () => {
  it('config should not start with hyphen', () => {
    const maliciousConfig = '- malicious';
    expect(maliciousConfig.startsWith('-')).toBe(true);
  });

  it('valid configs do not start with hyphen', () => {
    const validConfigs = ['defconfig', 'custom_defconfig', 'aosp_defconfig'];

    for (const config of validConfigs) {
      expect(config.startsWith('-')).toBe(false);
    }
  });
});

describe('ToolchainPaths in BuildConfig', () => {
  it('handles full toolchain paths', () => {
    const config: BuildConfig = {
      kernelDir: 'kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {
        clangPath: '/home/runner/clang',
        gcc64Path: '/home/runner/gcc-64',
        gcc32Path: '/home/runner/gcc-32',
        gcc64Prefix: 'aarch64-linux-android-4.9',
        gcc32Prefix: 'arm-linux-androideabi-4.9',
      },
      extraMakeArgs: '',
      useCcache: false,
    };

    expect(config.toolchain.clangPath).toBe('/home/runner/clang');
    expect(config.toolchain.gcc64Prefix).toBe('aarch64-linux-android-4.9');
  });

  it('handles undefined toolchain paths', () => {
    const config: BuildConfig = {
      kernelDir: 'kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    expect(config.toolchain.clangPath).toBeUndefined();
    expect(config.toolchain.gcc64Prefix).toBeUndefined();
  });

  it('handles system toolchain fallback', () => {
    const config: BuildConfig = {
      kernelDir: 'kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {
        gcc64Prefix: 'aarch64-linux-gnu',
        gcc32Prefix: 'arm-linux-gnueabihf',
      },
      extraMakeArgs: '',
      useCcache: false,
    };

    expect(config.toolchain.gcc64Prefix).toBe('aarch64-linux-gnu');
  });
});

describe('buildKernel', () => {
  it('throws error for config starting with hyphen', async () => {
    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      config: '-malicious',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    await expect(buildKernel(config)).rejects.toThrow('config input must not start with a hyphen');
  });

  it('throws error for invalid architecture', async () => {
    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'invalid_arch',
      config: 'defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    await expect(buildKernel(config)).rejects.toThrow('Invalid architecture');
  });

  it('accepts all valid architectures', async () => {
    const validArchs = ['arm', 'arm64', 'x86', 'x86_64', 'riscv', 'riscv64', 'mips', 'mips64'];

    for (const arch of validArchs) {
      vi.clearAllMocks();
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(exec.exec).mockResolvedValue(0);

      const config: BuildConfig = {
        kernelDir: '/kernel',
        arch,
        config: 'defconfig',
        toolchain: {},
        extraMakeArgs: '',
        useCcache: false,
      };

      await expect(buildKernel(config)).resolves.not.toThrow();
    }
  });

  it('builds with Clang toolchain', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.appendFileSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {
        clangPath: '/clang',
        gcc64Path: '/gcc-64',
        gcc32Path: '/gcc-32',
        gcc64Prefix: 'aarch64-linux-android-4.9',
        gcc32Prefix: 'arm-linux-androideabi-4.9',
      },
      extraMakeArgs: '',
      useCcache: false,
    };

    const result = await buildKernel(config);

    expect(result).toBe(true);
    expect(exec.exec).toHaveBeenCalledWith(
      'make',
      expect.arrayContaining(['defconfig', 'ARCH=arm64']),
      expect.any(Object)
    );
  });

  it('builds with GCC toolchain', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.appendFileSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {
        gcc64Path: '/gcc-64',
        gcc32Path: '/gcc-32',
        gcc64Prefix: 'aarch64-linux-gnu',
        gcc32Prefix: 'arm-linux-gnueabihf',
      },
      extraMakeArgs: '',
      useCcache: false,
    };

    const result = await buildKernel(config);

    expect(result).toBe(true);
    expect(exec.exec).toHaveBeenCalled();
  });

  it('builds with system toolchain fallback', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.appendFileSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    const result = await buildKernel(config);

    expect(result).toBe(true);
  });

  it('handles build failure', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.appendFileSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(1);

    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    const result = await buildKernel(config);

    expect(result).toBe(false);
  });

  it('includes ccache in PATH when enabled', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.appendFileSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: true,
    };

    await buildKernel(config);

    expect(exec.exec).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          USE_CCACHE: '1',
        }),
      })
    );
  });

  it('handles exec exception and returns false', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.appendFileSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockRejectedValue(new Error('Command failed'));

    const config: BuildConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      config: 'defconfig',
      toolchain: {},
      extraMakeArgs: '',
      useCcache: false,
    };

    const result = await buildKernel(config);

    expect(result).toBe(false);
    expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Build command failed'));
  });
});

describe('isBuildSuccessful', () => {
  it('returns true when Image exists in boot directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['Image'] as any);

    const result = isBuildSuccessful('/kernel', 'arm64');

    expect(result).toBe(true);
  });

  it('returns true when Image.gz exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['Image.gz'] as any);

    const result = isBuildSuccessful('/kernel', 'arm64');

    expect(result).toBe(true);
  });

  it('returns false when boot directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = isBuildSuccessful('/kernel', 'arm64');

    expect(result).toBe(false);
  });

  it('returns false when no Image files exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['dtbo.img', 'dtb'] as any);

    const result = isBuildSuccessful('/kernel', 'arm64');

    expect(result).toBe(false);
  });
});
