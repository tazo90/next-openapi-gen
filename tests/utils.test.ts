import { describe, it, expect } from 'vitest';
import { extractJSDocComments, parseTypeScriptFile } from '../src/lib/utils.js';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;

describe('extractJSDocComments - @ignore tag', () => {
  it('should detect @ignore tag in JSDoc comments', () => {
    const code = `
      /**
       * Internal route - should not be documented
       * @ignore
       */
      export async function GET() {
        return { message: 'Internal' };
      }
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.isIgnored).toBe(true);
  });

  it('should not set isIgnored when @ignore tag is absent', () => {
    const code = `
      /**
       * Public API route
       * @openapi
       */
      export async function GET() {
        return { message: 'Public' };
      }
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.isIgnored).toBe(false);
  });

  it('should handle @ignore tag combined with other tags', () => {
    const code = `
      /**
       * Test route for development
       * @description A route used for testing
       * @response TestResponse
       * @ignore
       * @deprecated
       */
      export async function POST() {
        return { test: true };
      }
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.isIgnored).toBe(true);
    expect(dataTypes?.deprecated).toBe(true);
    expect(dataTypes?.description).toBe('A route used for testing');
    expect(dataTypes?.responseType).toBeDefined();
  });

  it('should work with minimal JSDoc', () => {
    const code = `
      /** @ignore */
      export async function DELETE() {
        return { deleted: true };
      }
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.isIgnored).toBe(true);
  });

  it('should handle routes without any JSDoc comments', () => {
    const code = `
      export async function GET() {
        return { message: 'No comments' };
      }
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.isIgnored).toBe(false);
  });

  it('should handle @ignore in multiline comments', () => {
    const code = `
      /**
       * Internal debugging route
       *
       * This route should not appear in the API documentation
       * as it's only for internal use.
       *
       * @ignore
       * @tag Internal
       */
      export async function GET() {
        return { debug: true };
      }
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.isIgnored).toBe(true);
    expect(dataTypes?.tag).toBe('Internal');
  });

  it('should handle variable declarations with @ignore', () => {
    const code = `
      /**
       * @ignore
       */
      export const GET = async () => {
        return { message: 'Variable function' };
      };
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.isIgnored).toBe(true);
  });

  it('should handle @ignore with other boolean tags', () => {
    const code = `
      /**
       * @openapi
       * @ignore
       * @deprecated
       */
      export async function PATCH() {
        return { updated: true };
      }
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.isIgnored).toBe(true);
    expect(dataTypes?.isOpenApi).toBe(true);
    expect(dataTypes?.deprecated).toBe(true);
  });
});

describe('extractJSDocComments - @operationId tag', () => {
  it('should extract @operationId from JSDoc comment', () => {
    const code = `
      /**
       * Get user by ID
       * @operationId getUserById
       * @response UserResponse
       */
      export async function GET() {}
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.operationId).toBe('getUserById');
    expect(dataTypes?.responseType).toBe('UserResponse');
  });

  it('should return empty operationId when not specified', () => {
    const code = `
      /**
       * Get user by ID
       * @response UserResponse
       */
      export async function GET() {}
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes).toBeDefined();
    expect(dataTypes?.operationId).toBe('');
    expect(dataTypes?.responseType).toBe('UserResponse');
  });

  it('should handle @operationId with underscores and numbers', () => {
    const code = `
      /**
       * @operationId create_user_v2
       */
      export async function POST() {}
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes?.operationId).toBe('create_user_v2');
  });

  it('should extract @operationId alongside other tags', () => {
    const code = `
      /**
       * Create new user
       * @description Creates a new user in the system
       * @operationId createNewUser
       * @body CreateUserBody
       * @response 201:UserResponse
       * @auth bearer,CustomType
       * @tag Users
       */
      export async function POST() {}
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes?.operationId).toBe('createNewUser');
    expect(dataTypes?.description).toBe('Creates a new user in the system');
    expect(dataTypes?.bodyType).toBe('CreateUserBody');
    expect(dataTypes?.successCode).toBe('201');
    expect(dataTypes?.responseType).toBe('UserResponse');
    expect(dataTypes?.auth).toBe('BearerAuth,CustomType');
    expect(dataTypes?.tag).toBe('Users');
  });

  it('should handle camelCase operationId', () => {
    const code = `
      /**
       * @operationId listAllUsersWithFilters
       */
      export async function GET() {}
    `;

    const ast = parseTypeScriptFile(code);
    let dataTypes;

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes?.operationId).toBe('listAllUsersWithFilters');
  });
});
