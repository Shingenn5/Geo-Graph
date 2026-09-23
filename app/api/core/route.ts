import { CORE_MANIFEST } from "@/app/lib/core/manifest";

export function GET() {
  return Response.json(CORE_MANIFEST, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
