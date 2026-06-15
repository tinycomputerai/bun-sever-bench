const port = Number(Bun.env.PORT ?? 3000);

Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true }, { status: 200 });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
});

console.log(`reference server listening on ${port}`);
