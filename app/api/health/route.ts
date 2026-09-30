export function GET() {
  return Response.json({ application: "geo-graph", status: "ready" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
