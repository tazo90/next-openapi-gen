import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Get product by ID
 * @description Retrieve a specific product by its ID
 * @pathParams ProductIdParamsSchema
 * @response ProductSchema
 * @method GET
 * @openapi
 */
/**
 * Update product
 * @description Update an existing product's information
 * @pathParams ProductIdParamsSchema
 * @body CreateProductSchema
 * @response ProductSchema
 * @method PUT
 * @openapi
 */
/**
 * Delete product
 * @description Remove a product from the catalog
 * @pathParams ProductIdParamsSchema
 * @response 204
 * @method DELETE
 * @openapi
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === "GET") {
    res.status(200).json({
      id: id as string,
      name: "Laptop",
      description: "A powerful laptop",
      price: 999.99,
      stock: 50,
      category: "Electronics",
    });
  } else if (req.method === "PUT") {
    const { name, description, price, stock, category } = req.body;
    res.status(200).json({
      id: id as string,
      name,
      description,
      price,
      stock,
      category,
    });
  } else if (req.method === "DELETE") {
    res.status(204).end();
  } else {
    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
