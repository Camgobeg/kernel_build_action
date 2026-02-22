import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  packageKernel,
  packageBootimg,
  packageAnyKernel3,
  PackageConfig,
} from '../src/packager';
import * as fs from 'fs';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

// Mock dependencies
vi.mock('fs');
vi.mock('@actions/core');
vi.mock('@actions/exec');

// Helper to create mock dirent
const createMockDirent = (name: string, isDir: boolean) => ({
  name,
  isDirectory: () => isDir,
  isFile: () => !isDir,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('packageBootimg', () => {
  const baseConfig: PackageConfig = {
    kernelDir: '/kernel',
    arch: 'arm64',
    anykernel3: false,
    bootimgUrl: 'https://example.com/boot.img',
    buildDir: '/build',
  };

  it('throws error when bootimgUrl is not provided', async () => {
    const config = { ...baseConfig, bootimgUrl: undefined };

    await expect(packageBootimg(config)).rejects.toThrow(
      'bootimg-url input is required when anykernel3 is set to false'
    );
  });

  it('throws error for bootimgUrl starting with hyphen', async () => {
    const config = { ...baseConfig, bootimgUrl: '-malicious' };

    await expect(packageBootimg(config)).rejects.toThrow(
      'bootimg-url must not start with a hyphen'
    );
  });

  it('packages boot.img successfully', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.chmodSync).mockImplementation(() => undefined);
    vi.mocked(fs.readFileSync).mockReturnValue('KERNEL_FMT [raw]');
    vi.mocked(fs.readdirSync).mockImplementation((path, options) => {
      const p = String(path);
      if (p.includes('boot')) {
        // Return dirent objects for findKernelImage to work
        if (options && typeof options === 'object' && 'withFileTypes' in options) {
          return [createMockDirent('Image.gz-dtb', false)] as any;
        }
        return ['Image.gz-dtb'] as any;
      }
      if (p.includes('split')) return ['new.img'] as any;
      return [] as any;
    });
    vi.mocked(fs.renameSync).mockImplementation(() => undefined);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageBootimg(baseConfig);

    expect(exec.exec).toHaveBeenCalledWith(
      'aria2c',
      expect.arrayContaining(['--', 'https://example.com/boot.img'])
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith('split', { recursive: true });
  });

  it('downloads correct magiskboot for x64 architecture', async () => {
    const originalArch = process.arch;
    Object.defineProperty(process, 'arch', { value: 'x64' });

    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.chmodSync).mockImplementation(() => undefined);
    vi.mocked(fs.readFileSync).mockReturnValue('KERNEL_FMT [raw]');
    vi.mocked(fs.readdirSync).mockImplementation((path, options) => {
      const p = String(path);
      if (p.includes('boot')) {
        if (options && typeof options === 'object' && 'withFileTypes' in options) {
          return [createMockDirent('Image.gz-dtb', false)] as any;
        }
        return ['Image.gz-dtb'] as any;
      }
      if (p.includes('split')) return ['new.img'] as any;
      return [] as any;
    });
    vi.mocked(fs.renameSync).mockImplementation(() => undefined);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageBootimg(baseConfig);

    expect(exec.exec).toHaveBeenCalledWith(
      'aria2c',
      expect.arrayContaining([expect.stringContaining('magiskboot_x86')])
    );

    Object.defineProperty(process, 'arch', { value: originalArch });
  });
});

describe('packageAnyKernel3', () => {
  const baseConfig: PackageConfig = {
    kernelDir: '/kernel',
    arch: 'arm64',
    anykernel3: true,
    buildDir: '/build',
  };

  it('clones AnyKernel3 from default URL', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.includes('Image') || path.includes('anykernel.sh');
    });
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('BLOCK=/dev/block/platform/boot;');
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockReturnValue(['anykernel.sh'] as any);
    vi.mocked(fs.cpSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageAnyKernel3(baseConfig);

    expect(exec.exec).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone', '--', 'https://github.com/osm0sis/AnyKernel3'])
    );
  });

  it('clones AnyKernel3 from custom URL', async () => {
    const config = { ...baseConfig, anykernel3Url: 'https://github.com/custom/AnyKernel3' };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.includes('Image') || !path.includes('AnyKernel3');
    });
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    vi.mocked(fs.cpSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageAnyKernel3(config);

    expect(exec.exec).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone', '--', 'https://github.com/custom/AnyKernel3'])
    );
  });

  it('creates zip when release is true', async () => {
    const config = { ...baseConfig, release: true };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.includes('Image') || !path.includes('AnyKernel3');
    });
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockReturnValue(['anykernel.sh', 'Image'] as any);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageAnyKernel3(config);

    expect(exec.exec).toHaveBeenCalledWith(
      'zip',
      expect.arrayContaining(['-r', expect.stringContaining('AnyKernel3-flasher.zip')]),
      expect.objectContaining({ cwd: 'AnyKernel3' })
    );
  });

  it('copies files instead of zip when release is false', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      // Simulate Image exists in kernel out directory
      if (path.includes('/kernel/out/arch/arm64/boot/Image')) return true;
      // Simulate AnyKernel3 files exist after clone
      if (path.includes('AnyKernel3')) return true;
      return false;
    });
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const path = String(p);
      return { isDirectory: () => path.includes('subdir'), isFile: () => !path.includes('subdir') } as fs.Stats;
    });
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readFileSync).mockReturnValue('do.devicecheck=1');
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockImplementation((p, options) => {
      const path = String(p);
      if (path.includes('boot')) {
        if (options && typeof options === 'object' && 'withFileTypes' in options) {
          return [createMockDirent('Image', false)] as any;
        }
        return ['Image'] as any;
      }
      if (path.includes('AnyKernel3')) {
        return ['anykernel.sh', 'Image', 'subdir'] as any;
      }
      return [] as any;
    });
    vi.mocked(fs.cpSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageAnyKernel3(baseConfig);

    expect(fs.cpSync).toHaveBeenCalled();
    expect(exec.exec).not.toHaveBeenCalledWith('zip', expect.any(Array), expect.any(Object));
  });

  it('modifies anykernel.sh for generic use with default URL', async () => {
    const originalContent = `BLOCK=/dev/block/platform/omap/omap_hsmmc.0/by-name/boot;
do.devicecheck=1
IS_SLOT_DEVICE=0;`;

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.includes('anykernel.sh') || path.includes('Image');
    });
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(originalContent);
    vi.mocked(fs.writeFileSync).mockImplementation((path, content) => {
      expect(content).toContain('BLOCK=auto;');
      expect(content).toContain('do.devicecheck=0');
      expect(content).toContain('IS_SLOT_DEVICE=auto;');
    });
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockReturnValue(['anykernel.sh', 'Image'] as any);
    vi.mocked(fs.cpSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageAnyKernel3(baseConfig);

    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('handles missing DTBO and DTB files gracefully', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      // Only Image exists, no dtbo or dtb
      if (path.includes('Image')) return true;
      if (path.includes('anykernel.sh')) return true;
      return false;
    });
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('do.devicecheck=1');
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockReturnValue(['Image'] as any);
    vi.mocked(fs.cpSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageAnyKernel3(baseConfig);

    expect(core.info).toHaveBeenCalledWith('DTBO not found, skipping');
    expect(core.info).toHaveBeenCalledWith('DTB not found, skipping');
  });



  it('removes unnecessary files from AnyKernel3 directory', async () => {
    const existingFiles = new Set(['.git', '.gitattributes', '.gitignore', 'README.md', 'Image']);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      for (const file of existingFiles) {
        if (path.includes(file)) return true;
      }
      return false;
    });
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const path = String(p);
      return { 
        isDirectory: () => path.includes('.git'),
        isFile: () => !path.includes('.git')
      } as fs.Stats;
    });
    vi.mocked(fs.readFileSync).mockReturnValue('do.devicecheck=1');
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockReturnValue(['.git', '.gitattributes', '.gitignore', 'README.md', 'Image'] as any);
    vi.mocked(fs.cpSync).mockImplementation(() => undefined);
    vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageAnyKernel3(baseConfig);

    // .git directory should be removed with removeDir, files with unlinkSync
    expect(fs.unlinkSync).toHaveBeenCalled();
  });
});

describe('packageKernel', () => {
  it('calls packageAnyKernel3 when anykernel3 is true', async () => {
    const config: PackageConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      anykernel3: true,
      buildDir: '/build',
    };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.includes('Image') || !path.includes('AnyKernel3');
    });
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockReturnValue(['Image'] as any);
    vi.mocked(fs.cpSync).mockImplementation(() => undefined);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageKernel(config);

    expect(exec.exec).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone'])
    );
  });

  it('calls packageBootimg when anykernel3 is false', async () => {
    const config: PackageConfig = {
      kernelDir: '/kernel',
      arch: 'arm64',
      anykernel3: false,
      bootimgUrl: 'https://example.com/boot.img',
      buildDir: '/build',
    };

    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.chmodSync).mockImplementation(() => undefined);
    vi.mocked(fs.readFileSync).mockReturnValue('KERNEL_FMT [raw]');
    vi.mocked(fs.readdirSync).mockImplementation((path, options) => {
      const p = String(path);
      if (p.includes('boot')) {
        if (options && typeof options === 'object' && 'withFileTypes' in options) {
          return [createMockDirent('Image.gz-dtb', false)] as any;
        }
        return ['Image.gz-dtb'] as any;
      }
      if (p.includes('split')) return ['new.img'] as any;
      return [] as any;
    });
    vi.mocked(fs.renameSync).mockImplementation(() => undefined);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    vi.mocked(exec.exec).mockResolvedValue(0);

    await packageKernel(config);

    expect(exec.exec).toHaveBeenCalledWith(
      'aria2c',
      expect.arrayContaining([expect.stringContaining('boot.img')])
    );
  });
});
