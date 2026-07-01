import { recentWork } from '../lib/work-api';
import { workView } from '../lib/data';
import { WorkTimeline } from '../components/work-timeline';

export const dynamic = 'force-dynamic';

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[]; actor?: string | string[] }>;
}) {
  const sp = await searchParams;
  const project = Array.isArray(sp.project) ? sp.project[0] : sp.project;
  const actor = Array.isArray(sp.actor) ? sp.actor[0] : sp.actor;
  const rows = await recentWork({ project, actor });
  const view = workView(rows, { project, actor });
  return (
    <main className="okf-work okf-screen">
      <WorkTimeline view={view} />
    </main>
  );
}
