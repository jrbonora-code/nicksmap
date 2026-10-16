import { researchCacheableResponse } from '../../../../../lib/research/http';
import { oz2027PointsFor } from '../../../../../lib/research/oz2027-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchCacheableResponse(()=>oz2027PointsFor(new URL(request.url).searchParams));}
