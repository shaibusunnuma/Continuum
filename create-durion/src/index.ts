#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { Command } from 'commander';
import pc from 'picocolors';
import { runPrompts } from './prompts';
import { scaffold, installDependencies, detectPackageManager } from './scaffold';
import { getTemplate, LLM_PROVIDERS } from './templates';

const program = new Command();

program
  .name('create-durion')
  .description('Scaffold a new Durion project — durable AI workflows and agents on Temporal')
  .version('0.1.0')
  .argument('[project-name]', 'Name of the project directory')
  .option('--template <name>', 'Template: hello, agent, blank')
  .option('--llm <provider>', 'LLM provider: openai, anthropic, google')
  .option('--llm-api-key <key>', 'API key for the LLM provider')
  .option('--default', 'Skip prompts — use hello template with OpenAI')
  .option('--no-install', 'Skip npm install')
  .action(async (projectNameArg: string | undefined, opts: {
    template?: string;
    llm?: string;
    llmApiKey?: string;
    default?: boolean;
    install: boolean;
  }) => {
    try {
      let projectName: string;
      let templateName: string;
      let llmId: string;
      let apiKey: string | undefined;

      if (opts.default) {
        // Non-interactive: use defaults for everything
        projectName = projectNameArg ?? 'my-durion-app';
        templateName = opts.template ?? 'hello';
        llmId = opts.llm ?? 'openai';
        apiKey = opts.llmApiKey;
      } else if (projectNameArg && opts.template && opts.llm) {
        // All flags provided: non-interactive
        projectName = projectNameArg;
        templateName = opts.template;
        llmId = opts.llm;
        apiKey = opts.llmApiKey;
      } else {
        // Interactive mode
        const results = await runPrompts(projectNameArg);
        if (!results) process.exit(0);

        projectName = results.projectName;
        templateName = results.template.name;
        llmId = results.llm.id;
        apiKey = results.apiKey;
      }

      // Resolve template and LLM
      const template = getTemplate(templateName);
      if (!template) {
        console.error(`${pc.red('✗')} Unknown template: ${templateName}`);
        console.error(`  Available: ${['hello', 'agent', 'blank'].join(', ')}`);
        process.exit(1);
      }

      const llm = LLM_PROVIDERS.find((l) => l.id === llmId);
      if (!llm) {
        console.error(`${pc.red('✗')} Unknown LLM provider: ${llmId}`);
        console.error(`  Available: ${LLM_PROVIDERS.map((l) => l.id).join(', ')}`);
        process.exit(1);
      }

      // Create project directory
      const projectDir = path.resolve(process.cwd(), projectName);
      if (fs.existsSync(projectDir)) {
        const contents = fs.readdirSync(projectDir);
        if (contents.length > 0) {
          console.error(`${pc.red('✗')} Directory ${projectName}/ already exists and is not empty`);
          process.exit(1);
        }
      } else {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      // Scaffold
      console.log('');
      scaffold({
        projectName,
        projectDir,
        template,
        llm,
        apiKey,
      });

      // Install dependencies
      if (opts.install) {
        installDependencies(projectDir);
      }

      // Done — print next steps
      const pm = detectPackageManager();
      const runCmd = pm === 'npm' ? 'npx' : pm;

      console.log('');
      console.log(`  ${pc.green('Done!')} Next steps:`);
      console.log('');
      console.log(`    ${pc.cyan('cd')} ${projectName}`);
      if (!opts.install) {
        console.log(`    ${pc.cyan(pm)} install`);
      }
      console.log(`    ${pc.cyan(runCmd)} durion dev`);
      console.log('');
    } catch (err) {
      console.error(`${pc.red('✗')} ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program.parse();
