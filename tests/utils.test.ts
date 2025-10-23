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
