import { handleGraphGET } from '../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return handleGraphGET(req);
}
