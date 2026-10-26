import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
process.env.NODE_ENV = "test";
const { app, db } = await import("../server/index.js");
const email = `integration-${Date.now()}@example.com`;
const origin = process.env.APP_URL || "http://localhost:3000";
let cookie, userId;
after(async () => {
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});
test("catalog API returns actual matching products", async () => {
  const r = await request(app)
    .get("/api/products")
    .query({ q: "vegan protein under $40" });
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.products.map((p) => p.id),
    ["p2"],
  );
});
test("admin API rejects unauthenticated access", async () =>
  assert.equal((await request(app).get("/api/admin/products")).status, 401));
test("register and session, role protection, safe checkout, logout", async () => {
  const r = await request(app)
    .post("/api/auth/register")
    .set("Origin", origin)
    .send({
      name: "Test Customer",
      email,
      password: "Test-only-password-928!",
    });
  assert.equal(r.status, 200);
  assert.equal(r.body.role, "CUSTOMER");
  assert(!r.body.passwordHash);
  userId = r.body.id;
  cookie = r.headers["set-cookie"][0].split(";")[0];
  assert.equal(
    (await request(app).get("/api/me").set("Cookie", cookie)).body.email,
    email,
  );
  assert.equal(
    (await request(app).get("/api/admin/orders").set("Cookie", cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/admin/products")
        .set("Cookie", cookie)
        .set("Origin", origin)
        .send({})
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/checkout")
        .set("Cookie", cookie)
        .set("Origin", "https://untrusted.example")
        .send({})
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/checkout")
        .set("Cookie", cookie)
        .set("Origin", origin)
        .send({})
    ).status,
    503,
  );
  assert.equal(
    (await request(app).get("/api/orders").set("Cookie", cookie)).body.length,
    0,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/logout")
        .set("Cookie", cookie)
        .set("Origin", origin)
    ).status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/me").set("Cookie", cookie)).status,
    401,
  );
});
test("sitemap includes category and product URLs", async () => {
  const r = await request(app).get("/sitemap.xml");
  assert.equal(r.status, 200);
  assert(r.text.includes("/category/protein"));
  assert(r.text.includes("/product/whey-isolate"));
});
