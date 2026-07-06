import { handleWorkGET, handleWorkPOST } from '../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return handleWorkGET(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleWorkPOST(req);
}
