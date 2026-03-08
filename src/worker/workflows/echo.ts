import * as workflow from '@temporalio/workflow';
import type * as activities from '../activities/echo';

const { echo } = workflow.proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export async function Echo(input: { message: string }): Promise<{ echoed: string }> {
  return echo(input);
}
