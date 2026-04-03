import * as p from '@clack/prompts';
import pc from 'picocolors';
import { TEMPLATES, LLM_PROVIDERS, type TemplateInfo, type LlmProvider } from './templates';
import { detectTemporalCli, getTemporalInstallHint } from './temporal-check';

export interface PromptResults {
  projectName: string;
  template: TemplateInfo;
  llm: LlmProvider;
  apiKey?: string;
}

export async function runPrompts(initialName?: string): Promise<PromptResults | null> {
  p.intro(pc.bold('Create a new Durion project'));

  // Project name
  const projectName = initialName ?? await p.text({
    message: 'Project name',
    placeholder: 'my-agent',
    validate: (val) => {
      if (!val.trim()) return 'Project name is required';
      if (/[^a-zA-Z0-9._-]/.test(val.trim())) return 'Use only letters, numbers, hyphens, dots, underscores';
      return undefined;
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel('Cancelled.');
    return null;
  }

  const name = typeof projectName === 'string' ? projectName.trim() : projectName;

  // Template
  const templateChoice = await p.select({
    message: 'Pick a template',
    options: TEMPLATES.map((t) => ({
      value: t.name,
      label: t.label,
      hint: t.description,
    })),
    initialValue: 'hello',
  });

  if (p.isCancel(templateChoice)) {
    p.cancel('Cancelled.');
    return null;
  }

  const template = TEMPLATES.find((t) => t.name === templateChoice)!;

  // LLM provider
  const llmChoice = await p.select({
    message: 'Default LLM provider',
    options: LLM_PROVIDERS.map((l) => ({
      value: l.id,
      label: l.label,
    })),
    initialValue: 'openai',
  });

  if (p.isCancel(llmChoice)) {
    p.cancel('Cancelled.');
    return null;
  }

  const llm = LLM_PROVIDERS.find((l) => l.id === llmChoice)!;

  // API key (optional)
  const apiKey = await p.text({
    message: `${llm.envVar} (leave blank to set later)`,
    placeholder: '',
  });

  if (p.isCancel(apiKey)) {
    p.cancel('Cancelled.');
    return null;
  }

  // Check for Temporal CLI
  const temporal = detectTemporalCli();
  if (temporal.found) {
    const loc = temporal.path ? ` at ${temporal.path}` : '';
    p.log.success(`Temporal CLI${temporal.version ? ` v${temporal.version}` : ''} detected${loc}`);
  } else {
    p.log.warn(
      `Temporal CLI not found. Install it before running ${pc.cyan('durion dev')}:\n` +
      `  ${pc.dim(getTemporalInstallHint())}`,
    );
  }

  return {
    projectName: name,
    template,
    llm,
    apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : undefined,
  };
}
