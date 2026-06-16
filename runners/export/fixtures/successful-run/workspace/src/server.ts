const port = Number(Bun.env.PORT ?? 3000);
const expectedToken = "benchmark-token";

Bun.serve({
  port,
  fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (request.method !== "GET" || pathname !== "/profile") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const authorization = request.headers.get("authorization") ?? "";
    if (authorization !== `Bearer ${expectedToken}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    return Response.json({ id: "user_1", email: "user@example.com" }, { status: 200 });
  },
});

console.log(`fixture server listening on ${port}`);
