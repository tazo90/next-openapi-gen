/**
 * Utility functions for products API
 * This file demonstrates the use of TypeScript utility types with next-openapi-gen
 */

// Base product data
export interface Product {
  id: string;
  name: string;
  price: number;
  description?: string;
  inStock: boolean;
}

/**
 * Simulates fetching a product from database
 * @param id Product ID
 * @returns Product data
 */
export async function getProductById(
  id: string
): Promise<{ product: Product; fetchedAt: string }> {
  // Simulate database fetch
  await new Promise((resolve) => setTimeout(resolve, 10));

  return {
    product: {
      id,
      name: "Sample Product",
      price: 99.99,
      description: "A great product",
      inStock: true,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Gets product summary (name and price only)
 * @param id Product ID
 */
export async function getProductSummary(
  id: string
): Promise<{ name: string; price: number }> {
  const { product } = await getProductById(id);
  return {
    name: product.name,
    price: product.price,
  };
}

/**
 * Creates a new product
 * @param productData Product creation data
 * @param options Creation options
 */
export function createProduct(
  productData: { name: string; price: number },
  options: { notify: boolean }
): { success: boolean; productId: string } {
  console.log("Creating product with options:", options);
  return {
    success: true,
    productId: Math.random().toString(36).substring(7),
  };
}

/**
 * Updates product stock status
 * @param id Product ID
 * @param inStock New stock status
 * @returns Update confirmation with timestamp
 */
export async function updateStock(
  id: string,
  inStock: boolean
): Promise<{ updated: boolean; productId: string; timestamp: string }> {
  // Simulate database update
  await new Promise((resolve) => setTimeout(resolve, 10));

  return {
    updated: true,
    productId: id,
    timestamp: new Date().toISOString(),
  };
}
