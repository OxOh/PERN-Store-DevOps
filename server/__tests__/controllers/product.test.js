const supertest = require("supertest");
const app = require("../../app");
const pool = require("../../config");

const api = supertest(app);

describe("/api/products", () => {
  it("should return a list of products", async () => {
    const res = await api.get("/api/products?page=1");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("should return products with the expected fields", async () => {
    const res = await api.get("/api/products?page=1");
    const product = res.body[0];
    expect(product).toHaveProperty("product_id");
    expect(product).toHaveProperty("name");
    expect(product).toHaveProperty("slug");
    expect(product).toHaveProperty("price");
  });
});

afterAll(async () => {
  await pool.end();
});
