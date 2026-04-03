import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import pc from 'picocolors';
import { type LlmProvider, type TemplateInfo, renderTemplate } from './templates';

export interface ScaffoldOptions {
  projectName: string;
  projectDir: string;
  template: TemplateInfo;
  llm: LlmProvider;
  apiKey?: string;
}

/**
 * Write all template files into the project directory and install dependencies.
 */
export function scaffold(opts: ScaffoldOptions): void {
  const { projectName, projectDir, template, llm, apiKey } = opts;

  // Render all template files with variable substitution
  const files = renderTemplate(template, {
    projectName,
    taskQueue: projectName.replace(/[^a-zA-Z0-9-]/g, '-'),
    llmPackage: llm.package,
    llmImport: llm.importName,
    llmModel: llm.model,
    llmApiKeyEnvVar: llm.envVar,
  });

  // Write files
  for (const [filepath, content] of Object.entries(files)) {
    const fullPath = path.join(projectDir, filepath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let finalContent = content;
    // Inject API key if provided
    if (filepath === '.env' && apiKey) {
      finalContent = finalContent.replace(
        new RegExp(`^${llm.envVar}=.*$`, 'm'),
        `${llm.envVar}=${apiKey}`,
      );
    }

    fs.writeFileSync(fullPath, finalContent, 'utf-8');
  }

  console.log(`  ${pc.green('✓')} Created ${pc.bold(projectName)}/`);
}

/**
 * Detect the package manager used to invoke create-durion.
 */
export function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const agent = process.env.npm_config_user_agent ?? '';
  if (agent.startsWith('pnpm')) return 'pnpm';
  if (agent.startsWith('yarn')) return 'yarn';
  if (agent.startsWith('bun')) return 'bun';
  return 'npm';
}

/**
 * Run npm/pnpm/yarn install in the project directory.
 */
export function installDependencies(projectDir: string): void {
  const pm = detectPackageManager();
  const cmd = pm === 'yarn' ? 'yarn' : `${pm} install`;

  console.log(`  ${pc.yellow('▸')} Installing dependencies with ${pm}...`);

  try {
    execSync(cmd, {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    console.log(`  ${pc.green('✓')} Dependencies installed`);
  } catch (err) {
    console.log(`  ${pc.yellow('!')} Dependency install failed — run \`${cmd}\` manually in ${path.basename(projectDir)}/`);
  }
}
