#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const prompts = require('prompts');
const minimist = require('minimist');

const DEFAULT_CONFIG = {
  version: 1,
  codex: {
    path: 'codex',
    model: 'gpt-5',
    fullAuto: true,
    yolo: false,
    forceYolo: false,
    sandbox: 'workspace-write',
    search: false,
    extraArgs: []
  },
  repo: {
    requireConfirm: true,
    warnIfDirty: true,
    warnIfNonDefaultBranch: true,
    confirmIfNoRemote: true
  },
  branch: {
    create: true,
    prefix: '',
    pattern: 'codex-YYYYMMDD-HHMMSS',
    useCurrentBranchAsBase: true
  },
  prompt: {
    path: '.codex/CODEX_PROMPT.md',
    templatePath: '.codex/CODEX_PROMPT.template.md',
    immutableDuringRun: true,
    completionKey: 'PROMISE',
    completionValue: true,
    exitMessageKey: 'EXIT_MESSAGE'
  },
  loop: {
    maxLoops: 20,
    confirmMaxLoops: true,
    stopOnPromise: true,
    stopOnTestsPass: false,
    stopOnNoDiff: false,
    ignoreUntrackedForNoDiff: true
  },
  commands: {
    test: '',
    build: '',
    lint: ''
  },
  git: {
    commitEachIteration: true,
    commitMessageTemplate: 'codex-loop: iter {n} - {summary}',
    stageOnCommit: 'tracked',
    allowEmptyCommit: false
  },
  logging: {
    dir: '.codex_logs',
    commitLogs: false,
    writeJson: true
  }
};

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...options });
}

function runShell(command, options = {}) {
  return spawnSync(command, { encoding: 'utf8', shell: true, ...options });
}

function git(args, options = {}) {
  return run('git', args, options);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function deepMerge(target, source) {
  if (!source) return target;
  const output = { ...target };
  Object.keys(source).forEach((key) => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(output[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  });
  return output;
}

function ensureGitignore(repoRoot, entries) {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const missing = entries.filter((entry) => !existing.includes(entry));
  if (missing.length === 0) return;
  const newline = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
  fs.appendFileSync(gitignorePath, `${newline}${missing.join('\n')}\n`);
}

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function detectProjectTypes(repoRoot) {
  const hits = [];
  const fileMap = [
    { file: 'package.json', type: 'Node.js' },
    { file: 'pyproject.toml', type: 'Python' },
    { file: 'requirements.txt', type: 'Python' },
    { file: 'go.mod', type: 'Go' },
    { file: 'Cargo.toml', type: 'Rust' },
    { file: 'pom.xml', type: 'Java' },
    { file: 'build.gradle', type: 'Java' }
  ];
  fileMap.forEach(({ file, type }) => {
    if (fs.existsSync(path.join(repoRoot, file))) hits.push(type);
  });
  return Array.from(new Set(hits));
}

function suggestedCommands(projectType) {
  switch (projectType) {
    case 'Node.js':
      return { test: 'npm test', build: 'npm run build', lint: 'npm run lint' };
    case 'Python':
      return { test: 'pytest', build: '', lint: 'ruff .' };
    case 'Go':
      return { test: 'go test ./...', build: 'go build ./...', lint: '' };
    case 'Rust':
      return { test: 'cargo test', build: 'cargo build', lint: 'cargo fmt --check' };
    case 'Java':
      return { test: 'mvn test', build: 'mvn -q -DskipTests package', lint: '' };
    default:
      return { test: '', build: '', lint: '' };
  }
}

function renderTemplate(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return String(data[key]);
    }
    return match;
  });
}

function listToBullets(items, fallback = '(none)') {
  if (!items || items.length === 0) return `- ${fallback}`;
  return items.map((item) => `- ${item}`).join('\n');
}

function firstLineSummary(text) {
  if (!text) return 'updates';
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!line) return 'updates';
  return line.trim().slice(0, 72);
}

async function resolveRepoRoot(cwd, config) {
  const gitRoot = git(['rev-parse', '--show-toplevel'], { cwd });
  if (gitRoot.status === 0) {
    return gitRoot.stdout.trim();
  }

  const { repoChoice } = await prompts({
    type: 'select',
    name: 'repoChoice',
    message: 'No git repo detected. Choose how to proceed:',
    choices: [
      { title: 'Use local path', value: 'path' },
      { title: 'Clone from URL', value: 'url' },
      { title: 'Cancel', value: 'cancel' }
    ]
  });

  if (repoChoice === 'cancel' || !repoChoice) {
    process.exit(1);
  }

  if (repoChoice === 'path') {
    const { repoPath } = await prompts({
      type: 'text',
      name: 'repoPath',
      message: 'Enter local repo path:'
    });

    if (!repoPath) process.exit(1);

    const resolved = path.resolve(repoPath);
    if (!fs.existsSync(resolved)) {
      console.error('Path does not exist.');
      process.exit(1);
    }

    if (!fs.existsSync(path.join(resolved, '.git'))) {
      const { initRepo } = await prompts({
        type: 'confirm',
        name: 'initRepo',
        message: 'No .git found. Initialize a new repo here?',
        initial: false
      });
      if (!initRepo) process.exit(1);
      const init = git(['init'], { cwd: resolved });
      if (init.status !== 0) {
        console.error(init.stderr || 'Failed to initialize repo.');
        process.exit(1);
      }
    }

    return resolved;
  }

  const { repoUrl } = await prompts({
    type: 'text',
    name: 'repoUrl',
    message: 'Enter git URL to clone:'
  });
  if (!repoUrl) process.exit(1);

  const { targetDir } = await prompts({
    type: 'text',
    name: 'targetDir',
    message: 'Target directory for clone (blank for repo name):'
  });

  const dirName = targetDir && targetDir.trim().length > 0 ? targetDir.trim() : path.basename(repoUrl).replace(/\.git$/, '');
  const dest = path.resolve(cwd, dirName);
  const clone = git(['clone', repoUrl, dest], { cwd });
  if (clone.status !== 0) {
    console.error(clone.stderr || 'Failed to clone repo.');
    process.exit(1);
  }
  return dest;
}

async function confirmRepo(repoRoot, config) {
  const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
  const branch = branchResult.status === 0 ? branchResult.stdout.trim() : 'unknown';

  if (config.repo.requireConfirm) {
    const { useRepo } = await prompts({
      type: 'confirm',
      name: 'useRepo',
      message: `Use repo ${repoRoot} (branch ${branch})?`,
      initial: true
    });
    if (!useRepo) {
      const nextRoot = await resolveRepoRoot(process.cwd(), config);
      return confirmRepo(nextRoot, config);
    }
  }

  if (config.repo.warnIfDirty) {
    const dirty = git(['status', '--porcelain'], { cwd: repoRoot });
    if (dirty.stdout.trim().length > 0) {
      const { proceed } = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: 'Working tree is dirty. Continue?',
        initial: false
      });
      if (!proceed) process.exit(1);
    }
  }

  if (config.repo.confirmIfNoRemote) {
    const remotes = git(['remote'], { cwd: repoRoot });
    if (remotes.stdout.trim().length === 0) {
      const { proceed } = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: 'No git remote configured. Continue anyway?',
        initial: false
      });
      if (!proceed) process.exit(1);
    }
  }

  if (config.repo.warnIfNonDefaultBranch) {
    const defaultRef = git(['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: repoRoot });
    if (defaultRef.status === 0) {
      const defaultBranch = defaultRef.stdout.trim().split('/').pop();
      if (defaultBranch && defaultBranch !== branch) {
        console.warn(`Warning: current branch (${branch}) differs from default (${defaultBranch}).`);
      }
    }
  }

  return { repoRoot, branch };
}

async function maybeCreateBranch(repoRoot, config, dryRun) {
  let currentBranch = 'unknown';
  const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
  if (branchResult.status === 0) currentBranch = branchResult.stdout.trim();

  if (!config.branch.create) return currentBranch;

  const { createBranch } = await prompts({
    type: 'confirm',
    name: 'createBranch',
    message: 'Create a new branch for this run?',
    initial: true
  });
  if (!createBranch) return currentBranch;

  const { prefix } = await prompts({
    type: 'text',
    name: 'prefix',
    message: 'Branch prefix (initials, ticket id, etc.) [optional]:'
  });

  const timestamp = formatTimestamp();
  const branchName = `${prefix ? `${prefix.trim()}/` : ''}${config.branch.pattern.replace('YYYYMMDD-HHMMSS', timestamp)}`;

  if (dryRun) {
    console.log(`[dry-run] would create branch ${branchName} (base: ${currentBranch})`);
  } else {
    const checkout = git(['checkout', '-b', branchName], { cwd: repoRoot });
    if (checkout.status !== 0) {
      console.error(checkout.stderr || 'Failed to create branch.');
      process.exit(1);
    }
  }

  return branchName;
}

async function buildPrompt(repoRoot, branch, config) {
  const templatePath = path.join(repoRoot, config.prompt.templatePath);
  const template = fs.existsSync(templatePath)
    ? fs.readFileSync(templatePath, 'utf8')
    : fs.readFileSync(path.join(__dirname, '..', '.codex', 'CODEX_PROMPT.template.md'), 'utf8');

  const projectTypes = detectProjectTypes(repoRoot);
  let projectType = projectTypes[0] || 'Unknown';
  if (projectTypes.length > 1) {
    const { pickedType } = await prompts({
      type: 'select',
      name: 'pickedType',
      message: 'Select project type:',
      choices: projectTypes.map((type) => ({ title: type, value: type }))
    });
    projectType = pickedType || projectType;
  }

  const defaults = suggestedCommands(projectType);

  const { goal } = await prompts({
    type: 'text',
    name: 'goal',
    message: 'Describe the goal:'
  });

  const { inScope } = await prompts({
    type: 'list',
    name: 'inScope',
    message: 'In-scope items (comma separated):'
  });

  const { outScope } = await prompts({
    type: 'list',
    name: 'outScope',
    message: 'Out-of-scope items (comma separated):'
  });

  const { constraints } = await prompts({
    type: 'list',
    name: 'constraints',
    message: 'Extra constraints (comma separated):'
  });

  const { acceptanceCriteria } = await prompts({
    type: 'list',
    name: 'acceptanceCriteria',
    message: 'Acceptance criteria (comma separated):'
  });

  const { testCommand } = await prompts({
    type: 'text',
    name: 'testCommand',
    message: 'Test command:',
    initial: config.commands.test || defaults.test
  });

  const { buildCommand } = await prompts({
    type: 'text',
    name: 'buildCommand',
    message: 'Build command:',
    initial: config.commands.build || defaults.build
  });

  const { lintCommand } = await prompts({
    type: 'text',
    name: 'lintCommand',
    message: 'Lint command:',
    initial: config.commands.lint || defaults.lint
  });

  let maxLoops = config.loop.maxLoops;
  if (config.loop.confirmMaxLoops) {
    const { loopCount } = await prompts({
      type: 'number',
      name: 'loopCount',
      message: 'Max loop iterations (confirm):',
      initial: maxLoops
    });
    if (loopCount) maxLoops = loopCount;
  }

  const data = {
    repo: path.basename(repoRoot),
    branch,
    date: new Date().toISOString().split('T')[0],
    projectType,
    goal: goal || 'Describe the desired outcome.',
    inScope: listToBullets(inScope),
    outScope: listToBullets(outScope),
    constraints: constraints && constraints.length ? `\n${listToBullets(constraints)}` : '',
    acceptanceCriteria: listToBullets(acceptanceCriteria),
    testCommand: testCommand || '(none)',
    buildCommand: buildCommand || '(none)',
    lintCommand: lintCommand || '(none)',
    maxLoops
  };

  const rendered = renderTemplate(template, data);
  const promptPath = path.join(repoRoot, config.prompt.path);
  fs.mkdirSync(path.dirname(promptPath), { recursive: true });
  fs.writeFileSync(promptPath, rendered);

  return { promptPath, maxLoops, commands: { test: testCommand, build: buildCommand, lint: lintCommand } };
}

function parsePromise(output, key = 'PROMISE') {
  if (!output) return false;
  return output.includes(`${key}: true`);
}

function prepareCodexArgs(config, repoRoot) {
  const args = ['exec'];
  if (config.codex.yolo) {
    args.push('--yolo');
  } else if (config.codex.fullAuto) {
    args.push('--full-auto');
  }
  args.push('--cd', repoRoot, '--output-last-message');
  if (config.codex.model) args.push('--model', config.codex.model);
  if (config.codex.sandbox) args.push('--sandbox', config.codex.sandbox);
  if (config.codex.search) args.push('--search');
  if (Array.isArray(config.codex.extraArgs)) args.push(...config.codex.extraArgs);
  return args;
}

function formatCommand(cmd, args) {
  const parts = [cmd, ...args].map((part) => (part.includes(' ') ? `"${part}"` : part));
  return parts.join(' ');
}

function ensureLogDirs(repoRoot, config, runId) {
  const baseDir = path.join(repoRoot, config.logging.dir, runId);
  fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

function logIteration(baseDir, iteration, data) {
  const iterDir = path.join(baseDir, `iter-${iteration}`);
  fs.mkdirSync(iterDir, { recursive: true });
  if (data.prompt) fs.writeFileSync(path.join(iterDir, 'prompt.md'), data.prompt);
  if (data.output) fs.writeFileSync(path.join(iterDir, 'output.txt'), data.output);
  if (data.diff) fs.writeFileSync(path.join(iterDir, 'diff.patch'), data.diff);
  if (data.meta) writeJson(path.join(iterDir, 'meta.json'), data.meta);
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['yolo', 'force-yolo', 'search', 'log-commit', 'dry-run'],
    string: ['model', 'sandbox', 'codex-path', 'max-loops']
  });

  let config = deepMerge({}, DEFAULT_CONFIG);
  const dryRun = argv['dry-run'] === true;

  const repoRoot = await resolveRepoRoot(process.cwd(), config);
  const repoConfigPath = path.join(repoRoot, '.codex', 'config.json');
  const fileConfig = readJson(repoConfigPath);
  config = deepMerge(config, fileConfig);

  if (argv.model) config.codex.model = argv.model;
  if (argv.sandbox) config.codex.sandbox = argv.sandbox;
  if (argv.search) config.codex.search = true;
  if (argv['codex-path']) config.codex.path = argv['codex-path'];
  if (argv['max-loops']) config.loop.maxLoops = Number(argv['max-loops']);
  if (argv.yolo) config.codex.yolo = true;
  if (argv['force-yolo']) config.codex.forceYolo = true;
  if (argv['log-commit']) config.logging.commitLogs = true;

  if (config.codex.yolo && !config.codex.forceYolo) {
    console.error('Refusing to run with --yolo without --force-yolo.');
    process.exit(1);
  }

  if (!dryRun) {
    ensureGitignore(repoRoot, ['.codex/state.json', '.codex_logs/']);
    fs.mkdirSync(path.join(repoRoot, '.codex'), { recursive: true });
    if (!fs.existsSync(repoConfigPath)) {
      writeJson(repoConfigPath, config);
    }
  } else {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
    const missing = ['.codex/state.json', '.codex_logs/'].filter((entry) => !existing.includes(entry));
    if (missing.length > 0) {
      console.log(`[dry-run] .gitignore missing: ${missing.join(', ')}`);
    }
  }

  const repoInfo = await confirmRepo(repoRoot, config);
  const branch = await maybeCreateBranch(repoInfo.repoRoot, config, dryRun);

  const promptExists = fs.existsSync(path.join(repoInfo.repoRoot, config.prompt.path));
  if (promptExists) {
    const { updatePrompt } = await prompts({
      type: 'confirm',
      name: 'updatePrompt',
      message: 'Prompt file exists. Update it now?',
      initial: true
    });
    if (!updatePrompt) {
      console.error('Prompt update required to continue.');
      process.exit(1);
    }
  }

  const promptResult = await buildPrompt(repoInfo.repoRoot, branch, config);
  config.loop.maxLoops = promptResult.maxLoops;
  config.commands = { ...config.commands, ...promptResult.commands };

  const promptText = fs.readFileSync(promptResult.promptPath, 'utf8');
  const runId = formatTimestamp();
  const logsRoot = path.join(repoInfo.repoRoot, config.logging.dir, runId);

  if (dryRun) {
    const codexArgs = prepareCodexArgs(config, repoInfo.repoRoot);
    console.log('[dry-run] codex command:', formatCommand(config.codex.path, codexArgs));
    console.log('[dry-run] loop iterations:', config.loop.maxLoops);
    console.log('[dry-run] prompt path:', promptResult.promptPath);
    console.log('[dry-run] logs dir:', logsRoot);
    console.log('[dry-run] skipping codex execution and git commits.');
    return;
  }

  ensureLogDirs(repoInfo.repoRoot, config, runId);
  logIteration(logsRoot, 0, { prompt: promptText, meta: { runId, branch } });

  for (let i = 1; i <= config.loop.maxLoops; i += 1) {
    const codexArgs = prepareCodexArgs(config, repoInfo.repoRoot);
    const result = run(config.codex.path, codexArgs, {
      cwd: repoInfo.repoRoot,
      input: promptText,
      maxBuffer: 20 * 1024 * 1024
    });

    const output = result.stdout || '';
    const diff = git(['diff'], { cwd: repoInfo.repoRoot }).stdout || '';

    logIteration(logsRoot, i, {
      output,
      diff,
      meta: { exitCode: result.status }
    });

    const promiseFound = config.loop.stopOnPromise && parsePromise(output, config.prompt.completionKey);
    if (promiseFound) {
      console.log('Completion signal detected.');
    }

    let stopOnTests = false;
    if (config.loop.stopOnTestsPass && config.commands.test) {
      const testResult = runShell(config.commands.test, { cwd: repoInfo.repoRoot });
      stopOnTests = testResult.status === 0;
    }

    let stopOnNoDiff = false;
    if (config.loop.stopOnNoDiff) {
      const porcelainArgs = ['status', '--porcelain'];
      if (config.loop.ignoreUntrackedForNoDiff) porcelainArgs.push('-uno');
      const status = git(porcelainArgs, { cwd: repoInfo.repoRoot });
      stopOnNoDiff = status.stdout.trim().length === 0;
    }

    if (config.git.commitEachIteration) {
      const statusArgs = ['status', '--porcelain'];
      if (config.loop.ignoreUntrackedForNoDiff) statusArgs.push('-uno');
      const status = git(statusArgs, { cwd: repoInfo.repoRoot });
      if (status.stdout.trim().length > 0 || config.git.allowEmptyCommit) {
        if (config.git.stageOnCommit === 'all') {
          git(['add', '.'], { cwd: repoInfo.repoRoot });
        } else {
          git(['add', '-u'], { cwd: repoInfo.repoRoot });
        }
        if (config.logging.commitLogs) {
          git(['add', '-f', config.logging.dir], { cwd: repoInfo.repoRoot });
        }
        const summary = firstLineSummary(output);
        const message = config.git.commitMessageTemplate
          .replace('{n}', i)
          .replace('{summary}', summary);
        const commit = git(['commit', '-m', message], { cwd: repoInfo.repoRoot });
        if (commit.status !== 0) {
          console.warn(commit.stderr || 'Commit failed.');
        }
      }
    }

    writeJson(path.join(repoInfo.repoRoot, '.codex', 'state.json'), {
      repoRoot: repoInfo.repoRoot,
      branch,
      runId,
      iteration: i,
      promiseFound,
      timestamp: new Date().toISOString()
    });

    if (promiseFound || stopOnTests || stopOnNoDiff) break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
