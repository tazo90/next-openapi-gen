export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Drizzle-Zod Blog API
          </h1>
          <p className="text-xl text-gray-600">
            Example Next.js API with Drizzle ORM, Zod validation, and OpenAPI
            documentation
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Features</h2>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>
                <strong>Drizzle ORM</strong> - Type-safe database queries
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>
                <strong>drizzle-zod</strong> - Auto-generated Zod schemas from
                Drizzle tables
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>
                <strong>next-openapi-gen</strong> - Automatic OpenAPI 3.0
                documentation
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>
                <strong>Scalar UI</strong> - Modern API documentation interface
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Quick Start</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">
                1. View API Documentation
              </h3>
              <a
                href="/api-docs"
                className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg transition-colors"
              >
                Open API Docs →
              </a>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-2">
                2. Try the API
              </h3>
              <code className="block bg-gray-100 p-4 rounded text-sm overflow-x-auto">
                curl http://localhost:3000/api/posts
              </code>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-2">
                3. Create a Post
              </h3>
              <code className="block bg-gray-100 p-4 rounded text-sm overflow-x-auto">
                {`curl -X POST http://localhost:3000/api/posts \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "My First Post",
    "slug": "my-first-post",
    "content": "Hello World!",
    "authorId": 1
  }'`}
              </code>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold mb-4">Endpoints</h2>
          <div className="space-y-3">
            <div className="border-l-4 border-blue-500 pl-4">
              <div className="font-mono text-sm text-gray-600">
                GET /api/posts
              </div>
              <div className="text-gray-700">List all posts</div>
            </div>
            <div className="border-l-4 border-green-500 pl-4">
              <div className="font-mono text-sm text-gray-600">
                POST /api/posts
              </div>
              <div className="text-gray-700">Create a new post</div>
            </div>
            <div className="border-l-4 border-blue-500 pl-4">
              <div className="font-mono text-sm text-gray-600">
                GET /api/posts/[id]
              </div>
              <div className="text-gray-700">Get post by ID</div>
            </div>
            <div className="border-l-4 border-yellow-500 pl-4">
              <div className="font-mono text-sm text-gray-600">
                PATCH /api/posts/[id]
              </div>
              <div className="text-gray-700">Update post</div>
            </div>
            <div className="border-l-4 border-red-500 pl-4">
              <div className="font-mono text-sm text-gray-600">
                DELETE /api/posts/[id]
              </div>
              <div className="text-gray-700">Delete post</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
