export interface Product {
  id: string;
  sku: string;
  categoryId: string;
  name: string;
}

export interface ProductRouteApi {
  getProduct(slug: string): Promise<Product>;
  getInventory(sku: string): Promise<{ available: boolean }>;
  getReviewSummary(productId: string): Promise<{ average: number }>;
  getRelatedProducts(categoryId: string): Promise<string[]>;
}

export interface ProductRouteData {
  product: Product;
  inventory: { available: boolean };
  reviewSummary: { average: number };
  relatedProducts: string[];
}

export async function loadProductRoute(
  api: ProductRouteApi,
  slug: string,
): Promise<ProductRouteData> {
  const product = await api.getProduct(slug);
  const inventory = await api.getInventory(product.sku);
  const reviewSummary = await api.getReviewSummary(product.id);
  const relatedProducts = await api.getRelatedProducts(product.categoryId);

  return { product, inventory, reviewSummary, relatedProducts };
}
