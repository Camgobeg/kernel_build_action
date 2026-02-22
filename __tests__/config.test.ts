import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isConfigEnabled,
  getConfigValue,
  setConfig,
  appendConfig,
  readKernelConfig,
  writeKernelConfig,
  disableLto,
  enableKvm,
  applyKernelConfig,
} from '../src/config';
import * as fs from 'fs';
import * as core from '@actions/core';

// Mock fs and @actions/core
vi.mock('fs');
vi.mock('@actions/core');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isConfigEnabled', () => {
  it('returns true when option is enabled', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_TEST=y\nCONFIG_OTHER=n');
    expect(isConfigEnabled('/config', 'CONFIG_TEST')).toBe(true);
  });

  it('returns false when option is disabled', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_TEST=n\n');
    expect(isConfigEnabled('/config', 'CONFIG_TEST')).toBe(false);
  });

  it('returns false when option not present', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_OTHER=y\n');
    expect(isConfigEnabled('/config', 'CONFIG_TEST')).toBe(false);
  });

  it('returns false when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(isConfigEnabled('/nonexistent', 'CONFIG_TEST')).toBe(false);
  });

  it('handles special characters in option name', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_ARM64=y\n');
    expect(isConfigEnabled('/config', 'CONFIG_ARM64')).toBe(true);
  });
});

describe('getConfigValue', () => {
  it('returns value for existing option', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_TEST=123\n');
    expect(getConfigValue('/config', 'CONFIG_TEST')).toBe('123');
  });

  it('returns undefined for non-existing option', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_OTHER=123\n');
    expect(getConfigValue('/config', 'CONFIG_TEST')).toBeUndefined();
  });

  it('returns undefined when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getConfigValue('/nonexistent', 'CONFIG_TEST')).toBeUndefined();
  });

  it('handles values with spaces', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_CMDLINE="console=tty"\n');
    expect(getConfigValue('/config', 'CONFIG_CMDLINE')).toBe('"console=tty"');
  });
});

describe('setConfig', () => {
  it('adds new option', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_OLD=y\n');
    const writeMock = vi.mocked(fs.writeFileSync);
    
    setConfig('/config', 'CONFIG_NEW', 'y');
    expect(writeMock).toHaveBeenCalled();
    const content = writeMock.mock.calls[0][1] as string;
    expect(content).toContain('CONFIG_NEW=y');
  });

  it('replaces existing option', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_TEST=n\n');
    const writeMock = vi.mocked(fs.writeFileSync);
    
    setConfig('/config', 'CONFIG_TEST', 'y');
    expect(writeMock).toHaveBeenCalled();
    const content = writeMock.mock.calls[0][1] as string;
    expect(content).toBe('CONFIG_TEST=y\n');
  });

  it('does nothing when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const writeMock = vi.mocked(fs.writeFileSync);
    const warningMock = vi.mocked(core.warning);
    
    setConfig('/nonexistent', 'CONFIG_TEST', 'y');
    expect(writeMock).not.toHaveBeenCalled();
    expect(warningMock).toHaveBeenCalled();
  });
});

describe('appendConfig', () => {
  it('appends option to file', () => {
    const appendMock = vi.mocked(fs.appendFileSync);
    appendConfig('/config', 'CONFIG_TEST=y');
    expect(appendMock).toHaveBeenCalledWith('/config', 'CONFIG_TEST=y\n');
  });
});

describe('readKernelConfig', () => {
  it('returns file content', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_TEST=y\n');
    expect(readKernelConfig('/config')).toBe('CONFIG_TEST=y\n');
  });

  it('returns empty string when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(readKernelConfig('/nonexistent')).toBe('');
  });
});

describe('writeKernelConfig', () => {
  it('writes content to file', () => {
    const writeMock = vi.mocked(fs.writeFileSync);
    writeKernelConfig('/config', 'CONFIG_TEST=y\n');
    expect(writeMock).toHaveBeenCalledWith('/config', 'CONFIG_TEST=y\n');
  });
});

describe('disableLto', () => {
  it('disables LTO options', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_LTO=y\nCONFIG_LTO_CLANG=y\nCONFIG_THINLTO=y\n');
    const writeMock = vi.mocked(fs.writeFileSync);
    
    disableLto('/config');
    expect(writeMock).toHaveBeenCalled();
    const content = writeMock.mock.calls[0][1] as string;
    expect(content).toContain('CONFIG_LTO=n');
    expect(content).toContain('CONFIG_LTO_CLANG=n');
    expect(content).toContain('CONFIG_THINLTO=n');
    expect(content).toContain('CONFIG_LTO_NONE=y');
  });

  it('adds LTO_NONE if not present', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_TEST=y\n');
    const writeMock = vi.mocked(fs.writeFileSync);
    
    disableLto('/config');
    const content = writeMock.mock.calls[0][1] as string;
    expect(content).toContain('CONFIG_LTO_NONE=y');
  });

  it('does nothing when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const warningMock = vi.mocked(core.warning);
    
    disableLto('/nonexistent');
    expect(warningMock).toHaveBeenCalledWith(expect.stringContaining('Config file not found'));
  });
});

describe('enableKvm', () => {
  it('appends KVM options', () => {
    const appendMock = vi.mocked(fs.appendFileSync);
    
    enableKvm('/config');
    expect(appendMock).toHaveBeenCalledTimes(4);
    expect(appendMock).toHaveBeenCalledWith('/config', 'CONFIG_VIRTUALIZATION=y\n');
    expect(appendMock).toHaveBeenCalledWith('/config', 'CONFIG_KVM=y\n');
  });
});

describe('applyKernelConfig', () => {
  it('applies disableLto option', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_LTO=y\n');
    const writeMock = vi.mocked(fs.writeFileSync);
    
    applyKernelConfig('/config', { disableLto: true });
    expect(writeMock).toHaveBeenCalled();
  });

  it('applies kvm option', () => {
    const appendMock = vi.mocked(fs.appendFileSync);
    
    applyKernelConfig('/config', { kvm: true });
    expect(appendMock).toHaveBeenCalledWith('/config', 'CONFIG_KVM=y\n');
  });

  it('applies both options', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CONFIG_LTO=y\n');
    const writeMock = vi.mocked(fs.writeFileSync);
    const appendMock = vi.mocked(fs.appendFileSync);
    
    applyKernelConfig('/config', { disableLto: true, kvm: true });
    expect(writeMock).toHaveBeenCalled();
    expect(appendMock).toHaveBeenCalled();
  });
});
