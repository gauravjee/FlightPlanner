// app/api/weather/route.ts
// API route to proxy weather requests (avoids CORS issues)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = searchParams.get('station') || 'VOBL';

  try {
    const [metarRes, tafRes] = await Promise.all([
      fetch(`https://aviationweather.gov/api/data/metar?ids=${station}&format=json`),
      fetch(`https://aviationweather.gov/api/data/taf?ids=${station}&format=json`),
    ]);

    const metarData = metarRes.ok ? await metarRes.json() : [];
    const tafData = tafRes.ok ? await tafRes.json() : [];

    return Response.json({ metar: metarData[0] || null, taf: tafData[0] || null });
  } catch {
    return Response.json({ error: 'Failed to fetch weather' }, { status: 500 });
  }
}