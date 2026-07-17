import { describe, expect, test } from "bun:test";

interface Product {
  id: string;
  sku: string;
  categoryId: string;
  name: string;
}

interface ProductRouteApi {
  getProduct(slug: string): Promise<Product>;
  getInventory(sku: string): Promise<{ available: boolean }>;
  getReviewSummary(productId: string): Promise<{ average: number }>;
  getRelatedProducts(categoryId: string): Promise<string[]>;
}

interface ProductRouteData {
  product: Product;
  inventory: { available: boolean };
  reviewSummary: { average: number };
  relatedProducts: string[];
}

interface ProductRouteModule {
  loadProductRoute(api: ProductRouteApi, slug: string): Promise<ProductRouteData>;
}

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

const candidatePath =
  Bun.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/async-product-route/v1/public/starter/src/product-route.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { loadProductRoute } = (await import(candidateUrl)) as ProductRouteModule;

describe("async-product-route-v1", () => {
  test("starts all post-product requests before any of them resolves", async () => {
    const calls: string[] = [];
    const product = deferred<Product>();
    const inventory = deferred<{ available: boolean }>();
    const reviewSummary = deferred<{ average: number }>();
    const relatedProducts = deferred<string[]>();

    const route = loadProductRoute(
      {
        getProduct: () => {
          calls.push("product");
          return product.promise;
        },
        getInventory: () => {
          calls.push("inventory");
          return inventory.promise;
        },
        getReviewSummary: () => {
          calls.push("reviews");
          return reviewSummary.promise;
        },
        getRelatedProducts: () => {
          calls.push("related");
          return relatedProducts.promise;
        },
      },
      "ocean-lamp",
    );

    expect(calls).toEqual(["product"]);

    product.resolve({
      id: "product-1",
      sku: "ocean-lamp",
      categoryId: "lighting",
      name: "Ocean Lamp",
    });

    await Promise.resolve();
    expect(calls).toEqual(["product", "inventory", "reviews", "related"]);

    inventory.resolve({ available: true });
    reviewSummary.resolve({ average: 4.8 });
    relatedProducts.resolve(["reef-lamp"]);

    await expect(route).resolves.toEqual({
      product: {
        id: "product-1",
        sku: "ocean-lamp",
        categoryId: "lighting",
        name: "Ocean Lamp",
      },
      inventory: { available: true },
      reviewSummary: { average: 4.8 },
      relatedProducts: ["reef-lamp"],
    });
  });
});
