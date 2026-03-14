/**
 * Workflow-only entry point. Use this in workflow files (loaded by Temporal's bundler)
 * so that the bundle does not include worker-only code (createWorker, defineModels, etc.).
 */
export { workflow } from './temporal/workflow-adapter';
export { agent } from './temporal/agent-workflow';
export type { WorkflowContext, ModelResult, ToolResult, Usage, Message, AgentConfig, AgentResult } from './types';
