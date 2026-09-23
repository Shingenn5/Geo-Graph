type PhotonFeature = { properties?: { state?: unknown; country?: unknown } };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!params.has("lat") || !params.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return Response.json({ error: "Provide valid lat and lng coordinates." }, { status: 400 });
  }

  const url = new URL("https://photon.komoot.io/reverse");
  url.search = new URLSearchParams({ lat: String(lat), lon: String(lng), limit: "1" }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Place lookup unavailable");
    const data = await response.json() as { features?: PhotonFeature[] };
    const properties = data.features?.[0]?.properties;
    const state = typeof properties?.state === "string" ? properties.state : null;
    const country = typeof properties?.country === "string" ? properties.country : null;
    return Response.json({ state, country, approximate: true, source: "Photon / OpenStreetMap" }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch {
    return Response.json({ error: "Place lookup unavailable" }, { status: 502 });
  }
}
