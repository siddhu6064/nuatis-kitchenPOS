import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import { menuRouter } from "./index.js";
import { authRouter } from "../auth.js";
import { signTerminalJwt } from "../../lib/jwt.js";

// Integration tests — skip when Supabase not configured
const hasSupabase = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_LOCATION = "00000000-0000-0000-0000-000000000010";
const DEMO_STAFF = "00000000-0000-0000-0000-000000000020";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.use("/v1/menu", menuRouter);
  return app;
}

describe.skipIf(!hasSupabase)("Menu CRUD — integration", () => {
  let sessionToken = "";
  let terminalToken = "";
  let createdCategoryId = "";
  let createdItemId = "";

  beforeAll(async () => {
    // Sign in as owner to get session token
    const app = buildApp();
    const res = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(res.status).toBe(200);
    sessionToken = res.body.token as string;

    // Mint terminal token directly (no PIN endpoint since seed has owner doing dual role)
    const { token } = await signTerminalJwt({
      tenant_id: DEMO_TENANT,
      location_id: DEMO_LOCATION,
      staff_id: DEMO_STAFF,
    });
    terminalToken = token;
  });

  // ---------------------------------------------------------------------------
  // GET /v1/menu/tree
  // ---------------------------------------------------------------------------
  it("GET /v1/menu/tree returns seeded data (2 categories, 12 items)", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/v1/menu/tree")
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("categories");
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories).toHaveLength(2);
    const totalItems = res.body.categories.flatMap((c: { items: unknown[] }) => c.items).length;
    expect(totalItems).toBe(12);
  });

  it("GET /v1/menu/tree with terminal JWT returns 200", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/v1/menu/tree")
      .set("Authorization", `Bearer ${terminalToken}`);
    expect(res.status).toBe(200);
  });

  it("GET /v1/menu/tree without auth returns 401", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/menu/tree");
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Categories CRUD
  // ---------------------------------------------------------------------------
  it("POST /v1/menu/categories creates a category and GET shows it", async () => {
    const app = buildApp();
    const create = await request(app)
      .post("/v1/menu/categories")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ name: "Test Category", sort_order: 99 });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe("Test Category");
    createdCategoryId = create.body.id as string;

    const list = await request(app)
      .get("/v1/menu/categories")
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(list.status).toBe(200);
    const names = (list.body as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain("Test Category");
  });

  it("POST /v1/menu/categories with terminal JWT returns 401 (wrong kind)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/menu/categories")
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ name: "Should Fail", sort_order: 0 });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Items CRUD
  // ---------------------------------------------------------------------------
  it("POST /v1/menu/items without category_id returns 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/menu/items")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ name: "Bad Item", price_cents: 100 }); // no category_id
    expect(res.status).toBe(400);
  });

  it("POST /v1/menu/items with foreign category_id returns 404 (tenant isolation)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/menu/items")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({
        name: "Cross-tenant Item",
        price_cents: 100,
        category_id: "00000000-0000-0000-0000-000000000099", // non-existent
      });
    expect(res.status).toBe(404);
  });

  it("POST /v1/menu/items creates item under test category", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/menu/items")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ name: "Test Drink", price_cents: 350, category_id: createdCategoryId });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test Drink");
    createdItemId = res.body.id as string;
  });

  it("PATCH /v1/menu/items/:id updates name and price", async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/v1/menu/items/${createdItemId}`)
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ name: "Updated Drink", price_cents: 400 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Drink");
    expect(res.body.price_cents).toBe(400);
  });

  it("DELETE /v1/menu/items/:id soft-deletes — excluded from default GET, visible with include_deleted=true", async () => {
    const app = buildApp();

    const del = await request(app)
      .delete(`/v1/menu/items/${createdItemId}`)
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(del.status).toBe(204);

    const listDefault = await request(app)
      .get(`/v1/menu/items?category_id=${createdCategoryId}`)
      .set("Authorization", `Bearer ${sessionToken}`);
    const ids = (listDefault.body as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(createdItemId);

    const listDeleted = await request(app)
      .get(`/v1/menu/items?category_id=${createdCategoryId}&include_deleted=true`)
      .set("Authorization", `Bearer ${sessionToken}`);
    const idsDeleted = (listDeleted.body as Array<{ id: string }>).map((i) => i.id);
    expect(idsDeleted).toContain(createdItemId);
  });

  // Cleanup — soft-delete test category
  it("DELETE test category (cleanup)", async () => {
    const app = buildApp();
    const res = await request(app)
      .delete(`/v1/menu/categories/${createdCategoryId}`)
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Auth guard unit tests — no Supabase needed
// ---------------------------------------------------------------------------
describe("Menu auth guards — unit", () => {
  it("GET /v1/menu/categories without auth returns 401", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/menu/categories");
    expect(res.status).toBe(401);
  });

  it("POST /v1/menu/categories without auth returns 401", async () => {
    const app = buildApp();
    const res = await request(app).post("/v1/menu/categories").send({ name: "x", sort_order: 0 });
    expect(res.status).toBe(401);
  });
});
