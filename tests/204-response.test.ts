import { describe, it, expect, beforeEach } from 'vitest';
import { RouteProcessor } from '../src/lib/route-processor.js';
import { OpenApiConfig, DataTypes } from '../src/types.js';

describe('RouteProcessor - 204 No Content Responses', () => {
  let routeProcessor: RouteProcessor;
  let baseConfig: OpenApiConfig;

  beforeEach(() => {
    baseConfig = {
      apiDir: './src/app/api',
      schemaDir: './tests/fixtures/204-response/types',
      docsUrl: 'api-docs',
      ui: 'scalar',
      outputFile: 'openapi.json',
      outputDir: './public',
      includeOpenApiRoutes: false,
      schemaType: 'typescript',
      debug: false,
    };
    routeProcessor = new RouteProcessor(baseConfig);
  });

  describe('Success response with @response 204', () => {
    it('should not include content section for 204 response', () => {
      const dataTypes: DataTypes = {
        responseType: 'Empty',
        successCode: '204',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'DELETE');

      expect(responses['204']).toBeDefined();
      expect(responses['204'].description).toBe('No Content');
      expect(responses['204'].content).toBeUndefined();
    });

    it('should use custom description for 204 response', () => {
      const dataTypes: DataTypes = {
        responseType: 'Empty',
        successCode: '204',
        responseDescription: 'User deleted successfully',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'DELETE');

      expect(responses['204']).toBeDefined();
      expect(responses['204'].description).toBe('User deleted successfully');
      expect(responses['204'].content).toBeUndefined();
    });

    it('should not include content section even when response type is specified', () => {
      const dataTypes: DataTypes = {
        responseType: 'SomeType',
        successCode: '204',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'DELETE');

      expect(responses['204']).toBeDefined();
      expect(responses['204'].content).toBeUndefined();
    });
  });

  describe('Other status codes should include content', () => {
    it('should include content section for 200 response', () => {
      const dataTypes: DataTypes = {
        responseType: 'User',
        successCode: '200',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'GET');

      expect(responses['200']).toBeDefined();
      expect(responses['200'].description).toBe('Successful response');
      expect(responses['200'].content).toBeDefined();
      expect(responses['200'].content['application/json']).toBeDefined();
      expect(responses['200'].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/User',
      });
    });

    it('should include content section for 201 response', () => {
      const dataTypes: DataTypes = {
        responseType: 'User',
        successCode: '201',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'POST');

      expect(responses['201']).toBeDefined();
      expect(responses['201'].description).toBe('Successful response');
      expect(responses['201'].content).toBeDefined();
      expect(responses['201'].content['application/json']).toBeDefined();
      expect(responses['201'].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/User',
      });
    });
  });

  describe('DELETE method defaults', () => {
    it('should default to 204 for DELETE method', () => {
      const dataTypes: DataTypes = {
        responseType: 'Empty',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'DELETE');

      expect(responses['204']).toBeDefined();
      expect(responses['204'].content).toBeUndefined();
    });

    it('should default to 204 for DELETE even without explicit @response', () => {
      const dataTypes: DataTypes = {};

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'DELETE');

      // DELETE without explicit @response should still generate 204 No Content
      expect(responses['204']).toBeDefined();
      expect(responses['204'].description).toBe('No Content');
      expect(responses['204'].content).toBeUndefined();
    });
  });

  describe('Custom responses with @add 204', () => {
    it('should not include content for @add 204:Empty', () => {
      const dataTypes: DataTypes = {
        responseType: 'User',
        successCode: '200',
        addResponses: '204:Empty',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'POST');

      expect(responses['204']).toBeDefined();
      expect(responses['204'].description).toBe('HTTP 204');
      expect(responses['204'].content).toBeUndefined();
    });

    it('should not include content for @add 204:SomeSchema', () => {
      const dataTypes: DataTypes = {
        responseType: 'User',
        successCode: '200',
        addResponses: '204:DeletedResponse',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'POST');

      expect(responses['204']).toBeDefined();
      expect(responses['204'].content).toBeUndefined();
    });

    it('should include content for @add 409:ConflictResponse', () => {
      const dataTypes: DataTypes = {
        responseType: 'User',
        successCode: '200',
        addResponses: '409:ConflictResponse',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'POST');

      expect(responses['409']).toBeDefined();
      expect(responses['409'].content).toBeDefined();
      expect(responses['409'].content['application/json']).toBeDefined();
      expect(responses['409'].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ConflictResponse',
      });
    });

    it('should handle multiple custom responses including 204', () => {
      const dataTypes: DataTypes = {
        responseType: 'User',
        successCode: '200',
        addResponses: '204:Empty,409:ConflictResponse',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'POST');

      // 204 should not have content
      expect(responses['204']).toBeDefined();
      expect(responses['204'].content).toBeUndefined();

      // 409 should have content
      expect(responses['409']).toBeDefined();
      expect(responses['409'].content).toBeDefined();
    });

    it('should use $ref for @add 204 without schema', () => {
      const dataTypes: DataTypes = {
        responseType: 'User',
        successCode: '200',
        addResponses: '204',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'POST');

      // When using only code (no schema), it creates a $ref to components/responses
      expect(responses['204']).toBeDefined();
      expect(responses['204'].$ref).toBe('#/components/responses/204');
    });
  });

  describe('Array response types with 204', () => {
    it('should not include content for 204 with array response type', () => {
      const dataTypes: DataTypes = {
        responseType: 'User[]',
        successCode: '204',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'DELETE');

      expect(responses['204']).toBeDefined();
      expect(responses['204'].content).toBeUndefined();
    });

    it('should include array schema for 200 with array response type', () => {
      const dataTypes: DataTypes = {
        responseType: 'User[]',
        successCode: '200',
      };

      // @ts-ignore - accessing private method for testing
      const responses = routeProcessor.buildResponsesFromConfig(dataTypes, 'GET');

      expect(responses['200']).toBeDefined();
      expect(responses['200'].content).toBeDefined();
      expect(responses['200'].content['application/json'].schema).toEqual({
        type: 'array',
        items: {
          $ref: '#/components/schemas/User',
        },
      });
    });
  });
});
