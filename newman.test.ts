import { describe, it, expect, beforeEach } from 'vitest';
import { validateCollection } from './newman';

describe('Newman Integration', () => {
  describe('validateCollection', () => {
    it('should validate a valid Postman Collection', () => {
      const validCollection = {
        info: {
          name: 'Test Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/',
        },
        item: [
          {
            name: 'Test Request',
            request: {
              method: 'GET',
              url: 'https://example.com/api/test',
            },
          },
        ],
      };

      const result = validateCollection(validCollection);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject a collection without info property', () => {
      const invalidCollection = {
        item: [],
      };

      const result = validateCollection(invalidCollection);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing "info" property in collection');
    });

    it('should reject a collection without name in info', () => {
      const invalidCollection = {
        info: {
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/',
        },
        item: [],
      };

      const result = validateCollection(invalidCollection);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Collection name is required in "info" property');
    });

    it('should reject a collection without schema in info', () => {
      const invalidCollection = {
        info: {
          name: 'Test Collection',
        },
        item: [],
      };

      const result = validateCollection(invalidCollection);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Collection schema is required in "info" property');
    });

    it('should accept a collection with empty item array', () => {
      const validCollection = {
        info: {
          name: 'Test Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/',
        },
        item: [],
      };

      const result = validateCollection(validCollection);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a collection with multiple items', () => {
      const validCollection = {
        info: {
          name: 'Test Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/',
        },
        item: [
          {
            name: 'Request 1',
            request: {
              method: 'GET',
              url: 'https://example.com/api/1',
            },
          },
          {
            name: 'Request 2',
            request: {
              method: 'POST',
              url: 'https://example.com/api/2',
            },
          },
        ],
      };

      const result = validateCollection(validCollection);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
