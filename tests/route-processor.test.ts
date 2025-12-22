import { describe, it, expect, beforeEach } from 'vitest';
import { RouteProcessor } from '../src/lib/route-processor.js';
import { OpenApiConfig, DataTypes } from '../src/types.js';

describe('RouteProcessor - Ignore Routes', () => {
  let routeProcessor: RouteProcessor;
  let baseConfig: OpenApiConfig;

  beforeEach(() => {
    baseConfig = {
      apiDir: './src/app/api',
      schemaDir: './src/types',
      docsUrl: 'api-docs',
      ui: 'scalar',
      outputFile: 'openapi.json',
      outputDir: './public',
      includeOpenApiRoutes: false,
      schemaType: 'typescript',
      debug: false,
    };
  });

  describe('shouldIgnoreRoute - @ignore tag', () => {
    it('should ignore route with @ignore tag', () => {
      routeProcessor = new RouteProcessor(baseConfig);
      const dataTypes: DataTypes = {
        isIgnored: true,
      };

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.shouldIgnoreRoute('/api/users', dataTypes);

      expect(result).toBe(true);
    });

    it('should not ignore route without @ignore tag', () => {
      routeProcessor = new RouteProcessor(baseConfig);
      const dataTypes: DataTypes = {
        isIgnored: false,
      };

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.shouldIgnoreRoute('/api/users', dataTypes);

      expect(result).toBe(false);
    });
  });

  describe('shouldIgnoreRoute - pattern matching', () => {
    it('should ignore route matching exact pattern', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal', '/api/debug'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/internal', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/debug', dataTypes)).toBe(true);
    });

    it('should not ignore route that does not match pattern', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users', dataTypes)).toBe(false);
    });

    it('should ignore routes matching wildcard pattern', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal/*', '/admin/*/temp'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/internal/debug', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/internal/users/test', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/admin/users/temp', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/admin/posts/temp', dataTypes)).toBe(true);
    });

    it('should not ignore routes that do not match wildcard pattern', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal/*'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users', dataTypes)).toBe(false);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/external/test', dataTypes)).toBe(false);
    });

    it('should handle multiple patterns', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal/*', '/debug', '/test/*'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/internal/users', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/debug', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/test/anything', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users', dataTypes)).toBe(false);
    });

    it('should work with empty ignoreRoutes array', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: [],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users', dataTypes)).toBe(false);
    });

    it('should work when ignoreRoutes is undefined', () => {
      routeProcessor = new RouteProcessor(baseConfig);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users', dataTypes)).toBe(false);
    });
  });

  describe('shouldIgnoreRoute - combination of tag and patterns', () => {
    it('should ignore if @ignore tag is present regardless of patterns', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal/*'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {
        isIgnored: true,
      };

      // Should be ignored even though it doesn't match the pattern
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users', dataTypes)).toBe(true);
    });

    it('should ignore if pattern matches even without @ignore tag', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal/*'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {
        isIgnored: false,
      };

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/internal/test', dataTypes)).toBe(true);
    });

    it('should not ignore if neither tag nor pattern match', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal/*'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {
        isIgnored: false,
      };

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users', dataTypes)).toBe(false);
    });
  });

  describe('shouldIgnoreRoute - edge cases', () => {
    it('should handle routes with path parameters', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/users/{id}/internal'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users/{id}/internal', dataTypes)).toBe(true);
    });

    it('should handle complex wildcard patterns', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/*/internal/*'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users/internal/debug', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/posts/internal/test', dataTypes)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/users/public/test', dataTypes)).toBe(false);
    });

    it('should handle routes with trailing slashes in patterns', () => {
      const config = {
        ...baseConfig,
        ignoreRoutes: ['/api/internal'],
      };
      routeProcessor = new RouteProcessor(config);
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      expect(routeProcessor.shouldIgnoreRoute('/api/internal', dataTypes)).toBe(true);
    });
  });

  describe('getRoutePath - custom apiDir handling', () => {
    it('should handle default apiDir "./src/app/api"', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/api',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/api/users/route.ts');
      expect(result).toBe('/users');
    });

    it('should handle custom apiDir "./src/app/private"', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/private',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/private/users/route.ts');
      expect(result).toBe('/users');
    });

    it('should handle apiDir with trailing slash', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/api/',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/api/users/route.ts');
      expect(result).toBe('/users');
    });

    it('should handle apiDir without leading "./"', () => {
      const config = {
        ...baseConfig,
        apiDir: 'src/app/api',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('src/app/api/users/route.ts');
      expect(result).toBe('/users');
    });

    it('should handle nested routes with custom apiDir', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/private',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/private/users/profile/route.ts');
      expect(result).toBe('/users/profile');
    });

    it('should handle Windows path separators', () => {
      const config = {
        ...baseConfig,
        apiDir: '.\\src\\app\\api',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('.\\src\\app\\api\\users\\route.ts');
      expect(result).toBe('/users');
    });

    it('should handle dynamic routes with custom apiDir', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/private',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/private/users/[id]/route.ts');
      expect(result).toBe('/users/{id}');
    });

    it('should handle route groups with custom apiDir', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/private',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/private/(authenticated)/users/route.ts');
      expect(result).toBe('/users');
    });

    it('should handle catch-all routes with custom apiDir', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/private',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/private/files/[...path]/route.ts');
      expect(result).toBe('/files/{path}');
    });

    it('should handle root route with custom apiDir', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/private',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/private/route.ts');
      expect(result).toBe('/');
    });

    it('should throw error when apiDir is not found in file path', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/api',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      expect(() => routeProcessor.getRoutePath('./src/app/private/users/route.ts'))
        .toThrow('Could not find apiDir "./src/app/api" in file path "./src/app/private/users/route.ts"');
    });

    it('should handle apiDir that appears multiple times in path (use first occurrence)', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/api',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/api/api-users/route.ts');
      expect(result).toBe('/api-users');
    });

    it('should handle .tsx route files', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/private',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src/app/private/users/route.tsx');
      expect(result).toBe('/users');
    });

    it('should handle mixed forward and backward slashes', () => {
      const config = {
        ...baseConfig,
        apiDir: './src/app/private',
      };
      routeProcessor = new RouteProcessor(config);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getRoutePath('./src\\app\\private/users/route.ts');
      expect(result).toBe('/users');
    });
  });
});
