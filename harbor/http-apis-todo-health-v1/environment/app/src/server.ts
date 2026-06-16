const port = Number(Bun.env.PORT ?? 3000);

Bun.serve({
  port,
  fetch() {
    return Response.json(
      { error: "not_implemented" },
      { status: 501 },
    );
  },
});

console.log(`starter server listening on ${port}`);
