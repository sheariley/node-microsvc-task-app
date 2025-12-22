export async function GET() {
  return new Response(JSON.stringify({ timestamp: Date.now() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
