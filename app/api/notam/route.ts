// app/api/notam/route.ts
// Proxy route to fetch NOTAMs from FAA (free, no key)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = searchParams.get('station') || 'VOBL';

  try {
    const res = await fetch(
      `https://aviationweather.gov/api/data/notam?ids=${station}&format=json`
    );

    if (!res.ok) {
      return Response.json({ error: 'Failed to fetch NOTAMs' }, { status: 500 });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: 'Failed to fetch NOTAMs' }, { status: 500 });
  }
}