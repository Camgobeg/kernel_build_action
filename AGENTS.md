# Android Kernel Build Action - Project Context

## Agent Quick Start

- For significant features or refactors, sketch a plan first; keep it updated as you work.
- Default to `rg` for searching and keep edits ASCII unless the file already uses non-ASCII.
- Run the component-specific checks below before handing work off; do not skip failing steps.
- When unsure which path to take, favor minimal risk changes that can run the workflow successfully.

## Project Overview

This is the **Android Kernel Build Action** - a comprehensive GitHub Action that automates the building of Android kernel source code. The project provides a flexible, configurable workflow for compiling Android kernels with support for various toolchains, architectures, and kernel modifications.

### Key Technologies
- **GitHub Actions** (YAML-based CI/CD automation)
- **TypeScript** (main build logic - migrated from bash composite action)
- **Node.js 20** (runtime environment)
- **@actions/toolkit** (core, exec, cache, artifact, github, tool-cache)
- **esbuild** (fast bundler for distribution)
- **Python 3** (kernel patch scripts)
- **Android NDK/AOSP toolchains** (GCC and Clang)
- **Various kernel modification frameworks** (KernelSU, NetHunter, LXC, Re-Kernel, BBG)
- **Multi-architecture support** (AMD64, ARM64)
- **Coccinelle** (semantic patching for kernel modifications)

## Project Structure

```
/home/user/a/
├── action.yml              # Main GitHub Action definition (node20 runtime)
├── README.md               # Comprehensive usage documentation
├── mkdtboimg.py            # Python tool for DTB/DTBO image manipulation
├── package.json            # Node.js dependencies and scripts
├── tsconfig.json           # TypeScript compiler configuration
├── yarn.lock               # Yarn dependency lock file
├── eslint.config.js        # ESLint flat configuration (v9+)
├── .prettierrc             # Prettier formatting configuration
├── .yamllint               # YAML linting configuration
├── .pylintrc               # Python linting configuration
├── LICENSE                 # Apache License 2.0
├── SECURITY.md             # Security policy documentation
├── AGENTS.md               # Project context and developer guide
├── dist/                   # Compiled JavaScript output (esbuild bundled)
│   ├── index.js            # Main bundled file for distribution
│   └── post/
│       └── index.js        # Post-phase bundled file
├── src/                    # TypeScript source code
│   ├── index.ts            # Main entry point with main phase
│   ├── post.ts             # Post-phase entry point (cleanup, error analysis)
│   ├── cache.ts            # @actions/cache integration for ccache
│   ├── clean.ts            # Cleanup logic (post phase)
│   ├── error.ts            # Error log analysis (30+ patterns)
│   ├── toolchain.ts        # Toolchain download and management
│   ├── kernel.ts           # Kernel source cloning and version detection
│   ├── config.ts           # Kernel config manipulation (LTO, KVM, etc.)
│   ├── patches.ts          # Kernel patches (KernelSU, NetHunter, LXC, BBG, ReKernel)
│   ├── builder.ts          # Kernel compilation with make
│   ├── packager.ts         # Output packaging (boot.img/AnyKernel3)
│   ├── artifact.ts         # @actions/artifact integration
│   ├── release.ts          # GitHub Release creation
│   └── utils.ts            # Utility functions
├── .gemini/                # AI assistant configuration
│   ├── config.yaml
│   └── styleguide.md
├── .github/                # GitHub configuration
│   ├── dependabot.yml
│   ├── pull_request_template.md
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug-report.yml
│   │   ├── common.yml
│   │   └── config.yml
│   └── workflows/
│       ├── main.yml        # Main test workflow
│       ├── build.yml       # Build verification
│       ├── lint.yml        # Linting checks
│       ├── check.yml       # Code quality checks
│       ├── lkm.yml         # LKM (Loadable Kernel Module) tests
│       └── close-pr.yml    # PR automation
├── kernelsu/               # KernelSU integration scripts
│   ├── apply_cocci.py
│   ├── classic.cocci
│   ├── minimal.cocci
│   └── README.md
├── lxc/                    # LXC/Docker support
│   ├── cgroup.cocci
│   ├── config.py
│   ├── patch_cocci.py
│   ├── xt_qtaguid.cocci
│   └── README.md
├── nethunter/              # Kali NetHunter integration
│   ├── config.py
│   ├── patch.py
│   └── README.md
└── rekernel/               # Re-Kernel support patches
    ├── patches/
    │   ├── binder.cocci
    │   ├── PATCH_ANALYSIS.md
    │   ├── proc_ops.cocci
    │   └── signal.cocci
    ├── cocci.zip
    ├── Kconfig
    ├── Makefile
    ├── patch.py
    ├── README.md
    ├── rekernel.c
    ├── rekernel.h
    └── src.zip
```

## Architecture

### TypeScript Action Structure

The action uses a two-phase execution model:

#### Main Phase (`src/index.ts` → `dist/index.js`)
- Environment validation (GitHub Actions Linux runner)
- Dependency installation (apt/pacman)
- Toolchain setup (AOSP/Custom GCC/Clang)
- Kernel source cloning
- Patch application (KernelSU, NetHunter, LXC, BBG, ReKernel)
- Kernel compilation with make
- Output packaging (boot.img or AnyKernel3)
- Artifact upload or Release creation

#### Post Phase (`src/post.ts` → `dist/post/index.js`, always runs)
- Error log analysis (only if build failed)
- Cleanup (removes toolchains, kernel source, temp files)
- Environment variable cleanup

### Module Organization

| Module | Responsibility |
|--------|---------------|
| `index.ts` | Main entry point, orchestrates the build process |
| `post.ts` | Post-phase entry point, handles cleanup and error analysis |
| `cache.ts` | ccache setup with @actions/cache |
| `clean.ts` | Directory and file cleanup |
| `error.ts` | Build log analysis with 30+ error patterns |
| `toolchain.ts` | Toolchain download and path management |
| `kernel.ts` | Git operations and kernel version detection |
| `config.ts` | Kernel config modifications |
| `patches.ts` | Integration with Python patch scripts |
| `builder.ts` | make execution with proper environment |
| `packager.ts` | boot.img/AnyKernel3 packaging |
| `artifact.ts` | @actions/artifact integration |
| `release.ts` | GitHub Release creation |
| `utils.ts` | Helper functions |

## Building and Running

### Development Workflow

```bash
# Install dependencies
yarn install

# Build (compile TypeScript to dist/ using esbuild)
yarn build

# Lint
yarn lint

# Format
yarn format
```

### Build Process

1. **TypeScript Compilation**: esbuild bundles TypeScript sources
   - `src/index.ts` → `dist/index.js` (main entry)
   - `src/post.ts` → `dist/post/index.js` (post entry, CJS format)
2. **Target**: Node.js 20, platform: node
3. **Distribution**: Both bundled files must be committed for GitHub Actions use

### Usage

Users reference the action in workflows:

```yaml
- name: Build Kernel
  uses: dabao1955/kernel_build_action@main
  with:
    kernel-url: https://github.com/username/kernel_repo
    kernel-branch: main
    config: defconfig
    arch: arm64
    aosp-clang: true
    android-version: 12
```

## Dependencies

### Runtime
- `@actions/core` ^3.0.0: Input/output, logging, state
- `@actions/exec` ^3.0.0: Shell command execution
- `@actions/cache` ^6.0.0: ccache caching
- `@actions/artifact` ^6.0.0: Build artifact upload
- `@actions/github` ^9.0.0: GitHub API
- `@actions/tool-cache` ^4.0.0: Tool downloading
- `@octokit/rest` ^22.0.1: GitHub REST API
- `@octokit/core` ^7.0.6: GitHub API core
- `@octokit/graphql` ^9.0.3: GitHub GraphQL API
- `@octokit/request` ^10.0.7: GitHub API requests

### Development
- `typescript` ^5.4.4: TypeScript compiler
- `esbuild` ^0.27.3: Fast bundler (replaced @vercel/ncc)
- `eslint` ^10.0.0: Linting with flat config
- `@eslint/js` ^10.0.0: ESLint JavaScript rules
- `@typescript-eslint/eslint-plugin` ^8.5.0: TypeScript ESLint plugin
- `@typescript-eslint/parser` ^8.5.0: TypeScript ESLint parser
- `prettier` ^3.2.5: Formatting
- `@types/node` ^25.3.0: Type definitions

## Key Features

### Kernel Modifications
- **KernelSU**: Root access framework (with LKM support)
- **NetHunter**: Penetration testing tools
- **LXC/Docker**: Container support
- **Re-Kernel**: Performance optimizations
- **BBG**: BaseBandGuard security
- **KVM**: Hardware virtualization

### Toolchain Support
- AOSP GCC/Clang (configurable versions)
- Custom toolchains via URL
- System toolchain fallback

### Build Features
- ccache via @actions/cache
- LTO control (enable/disable)
- Parallel builds
- Cross-compilation (arm64, x86_64, etc.)
- Vendor kernel support

### Output Options
- boot.img (direct kernel image)
- AnyKernel3 ZIP (flashable package)
- GitHub Release (automated)

## Configuration Files

### ESLint Configuration (eslint.config.js)
- Uses flat config format (ESLint v9+)
- TypeScript support via @typescript-eslint
- Configured for Node.js globals
- Rules: no-explicit-any off, explicit-function-return-type off

### Prettier Configuration (.prettierrc)
- semi: true
- trailingComma: es5
- singleQuote: true
- printWidth: 100
- tabWidth: 2

### TypeScript Configuration (tsconfig.json)
- Target: ES2022
- Module: commonjs
- Strict mode enabled
- Inline source maps

## Git Commit Conventions

```
component: <type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `dep`: Dependency update
- `build`: Build system changes
- `docs`: Documentation changes
- `refactor`: Code refactoring

Example:
```
action: feat(cache): Add @actions/cache for ccache

Replace external ccache-action with native @actions/cache.
Improves reliability and reduces external dependencies.

Signed-off-by: user <user@example.com>
```

## Code Quality

Before committing, always run:

```bash
# Lint TypeScript files
yarn lint

# Check formatting
yarn format:check

# Lint YAML files
yamllint action.yml

# Build to ensure no compilation errors
yarn build
```

### Workflow Checks

The project has several GitHub workflows:
- `build.yml`: Verifies the action builds successfully
- `lint.yml`: Runs ESLint and Prettier checks
- `check.yml`: Additional code quality checks
- `lkm.yml`: Tests LKM (Loadable Kernel Module) functionality
- `main.yml`: Main test workflow

## Migration Notes

### From ncc to esbuild
The project migrated from `@vercel/ncc` to `esbuild` for faster builds and smaller output:
- **Old**: `ncc build` produced a single file
- **New**: `esbuild` produces two files (main and post)
- **Benefits**: Faster compilation, better tree-shaking, native TypeScript support

### ESLint Flat Config
ESLint configuration moved from `.eslintrc.json` to `eslint.config.js`:
- Uses new flat config format (ESLint v9+)
- Better TypeScript integration
- Improved performance