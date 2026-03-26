import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Get all products
 * @description Retrieve a list of products with optional filtering
 * @params ProductListParamsSchema
 * @response ProductSchema[]
 * @method GET
 * @openapi
 */
/**
 * Create a new product
 * @description Add a new product to the catalog
 * @body CreateProductSchema
 * @response 201:ProductSchema
 * @method POST
 * @openapi
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { category, minPrice, maxPrice } = req.query;

    res.status(200).json([
      {
        id: "1",
        name: "Laptop",
        description: "A powerful laptop",
        price: 999.99,
        stock: 50,
        category: category || "Electronics",
      },
    ]);
  } else if (req.method === "POST") {
    const { name, description, price, stock, category } = req.body;

    res.status(201).json({
      id: "2",
      name,
      description,
      price,
      stock: stock || 0,
      category,
    });
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
