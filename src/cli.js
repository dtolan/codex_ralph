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

function defaultAnswer(question) {
  if (question.type === 'confirm') {
    return question.initial !== undefined ? question.initial : true;
  }
  if (question.type === 'select') {
    if (question.initial !== undefined) return question.initial;
    if (question.choices && question.choices.length > 0) return question.choices[0].value;
    return null;
  }
  if (question.type === 'number') {
    return question.initial !== undefined ? question.initial : 0;
  }
  if (question.type === 'list') {
    return [];
  }
  return question.initial !== undefined ? question.initial : '';
}

async function ask(question, defaultsMode) {
  if (!defaultsMode) return prompts(question);
  return { [question.name]: defaultAnswer(question) };
}

async function resolveRepoRoot(cwd, config, defaultsMode) {
  const gitRoot = git(['rev-parse', '--show-toplevel'], { cwd });
  if (gitRoot.status === 0) {
    return gitRoot.stdout.trim();
  }

  if (defaultsMode) {
    console.error('No git repo detected. Rerun without --defaults to select a repo.');
    process.exit(1);
  }

  const { repoChoice } = await ask({
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
    const { repoPath } = await ask({
      type: 'text',
      name: 'repoPath',
      message: 'Enter local repo path:'
    }, defaultsMode);

    if (!repoPath) process.exit(1);

    const resolved = path.resolve(repoPath);
    if (!fs.existsSync(resolved)) {
      console.error('Path does not exist.');
      process.exit(1);
    }

    if (!fs.existsSync(path.join(resolved, '.git'))) {
      const { initRepo } = await ask({
        type: 'confirm',
        name: 'initRepo',
        message: 'No .git found. Initialize a new repo here?',
        initial: false
      }, defaultsMode);
      if (!initRepo) process.exit(1);
      const init = git(['init'], { cwd: resolved });
      if (init.status !== 0) {
        console.error(init.stderr || 'Failed to initialize repo.');
        process.exit(1);
      }
    }

    return resolved;
  }

  const { repoUrl } = await ask({
    type: 'text',
    name: 'repoUrl',
    message: 'Enter git URL to clone:'
  }, defaultsMode);
  if (!repoUrl) process.exit(1);

  const { targetDir } = await ask({
    type: 'text',
    name: 'targetDir',
    message: 'Target directory for clone (blank for repo name):'
  }, defaultsMode);

  const dirName = targetDir && targetDir.trim().length > 0 ? targetDir.trim() : path.basename(repoUrl).replace(/\.git$/, '');
  const dest = path.resolve(cwd, dirName);
  const clone = git(['clone', repoUrl, dest], { cwd });
  if (clone.status !== 0) {
    console.error(clone.stderr || 'Failed to clone repo.');
    process.exit(1);
  }
  return dest;
}

async function confirmRepo(repoRoot, config, defaultsMode) {
  const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
  const branch = branchResult.status === 0 ? branchResult.stdout.trim() : 'unknown';

  if (config.repo.requireConfirm) {
    const { useRepo } = await ask({
      type: 'confirm',
      name: 'useRepo',
      message: `Use repo ${repoRoot} (branch ${branch})?`,
      initial: true
    }, defaultsMode);
    if (!useRepo) {
      const nextRoot = await resolveRepoRoot(process.cwd(), config, defaultsMode);
      return confirmRepo(nextRoot, config, defaultsMode);
    }
  }

  if (config.repo.warnIfDirty) {
    const dirty = git(['status', '--porcelain'], { cwd: repoRoot });
    if (dirty.stdout.trim().length > 0) {
      const { proceed } = await ask({
        type: 'confirm',
        name: 'proceed',
        message: 'Working tree is dirty. Continue?',
        initial: false
      }, defaultsMode);
      if (!proceed) process.exit(1);
    }
  }

  if (config.repo.confirmIfNoRemote) {
    const remotes = git(['remote'], { cwd: repoRoot });
    if (remotes.stdout.trim().length === 0) {
      const { proceed } = await ask({
        type: 'confirm',
        name: 'proceed',
        message: 'No git remote configured. Continue anyway?',
        initial: false
      }, defaultsMode);
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

async function maybeCreateBranch(repoRoot, config, dryRun, defaultsMode) {
  let currentBranch = 'unknown';
  const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
  if (branchResult.status === 0) currentBranch = branchResult.stdout.trim();

  if (!config.branch.create) return currentBranch;

  const { createBranch } = await ask({
    type: 'confirm',
    name: 'createBranch',
    message: 'Create a new branch for this run?',
    initial: true
  }, defaultsMode);
  if (!createBranch) return currentBranch;

  const { prefix } = await ask({
    type: 'text',
    name: 'prefix',
    message: 'Branch prefix (initials, ticket id, etc.) [optional]:'
  }, defaultsMode);

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

async function buildPrompt(repoRoot, branch, config, defaultsMode) {
  const templatePath = path.join(repoRoot, config.prompt.templatePath);
  const template = fs.existsSync(templatePath)
    ? fs.readFileSync(templatePath, 'utf8')
    : fs.readFileSync(path.join(__dirname, '..', '.codex', 'CODEX_PROMPT.template.md'), 'utf8');

  const projectTypes = detectProjectTypes(repoRoot);
  let projectType = projectTypes[0] || 'Unknown';
  if (projectTypes.length > 1) {
    const { pickedType } = await ask({
      type: 'select',
      name: 'pickedType',
      message: 'Select project type:',
      choices: projectTypes.map((type) => ({ title: type, value: type }))
    }, defaultsMode);
    projectType = pickedType || projectType;
  }

  const defaults = suggestedCommands(projectType);

  const { goal } = await ask({
    type: 'text',
    name: 'goal',
    message: 'Describe the goal:'
  }, defaultsMode);

  const { inScope } = await ask({
    type: 'list',
    name: 'inScope',
    message: 'In-scope items (comma separated):'
  }, defaultsMode);

  const { outScope } = await ask({
    type: 'list',
    name: 'outScope',
    message: 'Out-of-scope items (comma separated):'
  }, defaultsMode);

  const { constraints } = await ask({
    type: 'list',
    name: 'constraints',
    message: 'Extra constraints (comma separated):'
  }, defaultsMode);

  const { acceptanceCriteria } = await ask({
    type: 'list',
    name: 'acceptanceCriteria',
    message: 'Acceptance criteria (comma separated):'
  }, defaultsMode);

  const { testCommand } = await ask({
    type: 'text',
    name: 'testCommand',
    message: 'Test command:',
    initial: config.commands.test || defaults.test
  }, defaultsMode);

  const { buildCommand } = await ask({
    type: 'text',
    name: 'buildCommand',
    message: 'Build command:',
    initial: config.commands.build || defaults.build
  }, defaultsMode);

  const { lintCommand } = await ask({
    type: 'text',
    name: 'lintCommand',
    message: 'Lint command:',
    initial: config.commands.lint || defaults.lint
  }, defaultsMode);

  let maxLoops = config.loop.maxLoops;
  if (config.loop.confirmMaxLoops) {
    const { loopCount } = await ask({
      type: 'number',
      name: 'loopCount',
      message: 'Max loop iterations (confirm):',
      initial: maxLoops
    }, defaultsMode);
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

function writeState(repoRoot, data) {
  writeJson(path.join(repoRoot, '.codex', 'state.json'), data);
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['yolo', 'force-yolo', 'search', 'log-commit', 'dry-run', 'prompt-only', 'run-loop', 'update-prompt', 'defaults', 'help', 'print-config'],
    string: ['model', 'sandbox', 'codex-path', 'max-loops']
  });

  let config = deepMerge({}, DEFAULT_CONFIG);
  const dryRun = argv['dry-run'] === true;
  const promptOnly = argv['prompt-only'] === true;
  const runLoop = argv['run-loop'] === true;
  const updatePromptFlag = argv['update-prompt'] === true;
  const defaultsMode = argv.defaults === true;

  if (argv.help || argv.h) {
    console.log(`codex-loop usage:
  codex-loop [options]

Core options:
  --prompt-only       Build/update the prompt and exit (still writes .codex/state.json)
  --run-loop          Run using existing prompt (no prompt builder)
  --update-prompt     Rebuild prompt before running (works with default or --run-loop)
  --dry-run           Show planned actions without executing Codex or committing

Safety:
  --yolo              Allow Codex to run without sandbox/approvals (blocked unless --force-yolo)
  --force-yolo        Required to enable --yolo

Codex flags:
  --model <name>      Override model (default: ${DEFAULT_CONFIG.codex.model})
  --sandbox <mode>    Override sandbox (default: ${DEFAULT_CONFIG.codex.sandbox})
  --search            Enable search
  --codex-path <path> Override codex binary (default: ${DEFAULT_CONFIG.codex.path})

Loop:
  --max-loops <n>     Override max loops (default: ${DEFAULT_CONFIG.loop.maxLoops})
  --log-commit        Commit .codex_logs/ during each iteration

Automation:
  --defaults          Non-interactive mode; uses defaults and auto-confirms prompts
  --print-config      Print effective config and exit

Defaults mode behavior:
  - Auto-confirms repo usage, dirty tree warnings, and no-remote warnings.
  - Creates a branch using the default pattern and optional prefix (empty by default).
  - Builds a prompt using empty lists and default commands.
  - Requires an existing git repo; if none is detected, exits with an error.
`);
    process.exit(0);
  }

  if (promptOnly && runLoop) {
    console.error('Cannot use --prompt-only and --run-loop together.');
    process.exit(1);
  }

  const repoRoot = await resolveRepoRoot(process.cwd(), config, defaultsMode);
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

  if (argv['print-config']) {
    let derived = {};
    const cwd = process.cwd();
    const gitRoot = git(['rev-parse', '--show-toplevel'], { cwd });
    if (gitRoot.status === 0) {
      const repoRoot = gitRoot.stdout.trim();
      const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
      const branch = branchResult.status === 0 ? branchResult.stdout.trim() : null;
      const codexArgs = prepareCodexArgs(config, repoRoot);
      derived = {
        repoRoot,
        branch,
        codexCommand: formatCommand(config.codex.path, codexArgs)
      };
    }
    console.log(JSON.stringify({ config, derived }, null, 2));
    process.exit(0);
  }

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

  const repoInfo = await confirmRepo(repoRoot, config, defaultsMode);
  const branch = await maybeCreateBranch(repoInfo.repoRoot, config, dryRun, defaultsMode);

  const promptPath = path.join(repoInfo.repoRoot, config.prompt.path);
  const promptExists = fs.existsSync(promptPath);
  let promptResult = null;
  let promptText = '';

  if (runLoop && !updatePromptFlag) {
    if (!promptExists) {
      console.error('Prompt file not found. Run without --run-loop or pass --update-prompt.');
      process.exit(1);
    }
    promptText = fs.readFileSync(promptPath, 'utf8');
  } else {
    if (promptExists && !updatePromptFlag) {
      const { updatePrompt } = await ask({
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

    promptResult = await buildPrompt(repoInfo.repoRoot, branch, config, defaultsMode);
    config.loop.maxLoops = promptResult.maxLoops;
    config.commands = { ...config.commands, ...promptResult.commands };
    promptText = fs.readFileSync(promptResult.promptPath, 'utf8');
  }
  const runId = formatTimestamp();
  const logsRoot = path.join(repoInfo.repoRoot, config.logging.dir, runId);

  if (dryRun) {
    const codexArgs = prepareCodexArgs(config, repoInfo.repoRoot);
    console.log('[dry-run] codex command:', formatCommand(config.codex.path, codexArgs));
    console.log('[dry-run] loop iterations:', config.loop.maxLoops);
    console.log('[dry-run] prompt path:', promptResult.promptPath);
    console.log('[dry-run] logs dir:', logsRoot);
    console.log('[dry-run] skipping codex execution and git commits.');
    if (promptOnly) {
      writeState(repoInfo.repoRoot, {
        repoRoot: repoInfo.repoRoot,
        branch,
        runId,
        iteration: 0,
        promiseFound: false,
        timestamp: new Date().toISOString()
      });
    }
    return;
  }

  ensureLogDirs(repoInfo.repoRoot, config, runId);
  logIteration(logsRoot, 0, { prompt: promptText, meta: { runId, branch } });

  if (promptOnly) {
    writeState(repoInfo.repoRoot, {
      repoRoot: repoInfo.repoRoot,
      branch,
      runId,
      iteration: 0,
      promiseFound: false,
      timestamp: new Date().toISOString()
    });
    console.log('Prompt updated. Exiting due to --prompt-only.');
    return;
  }

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

    writeState(repoInfo.repoRoot, {
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
