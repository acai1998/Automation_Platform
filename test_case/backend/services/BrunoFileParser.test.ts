import { describe, expect, it } from 'vitest';
import { parseBruRequestFile } from '../../../server/services/BrunoAutomation/bruFileParser';

describe('parseBruRequestFile', () => {
  it('extracts request metadata from a Bruno request file', () => {
    const parsed = parseBruRequestFile(
      'orders/create-order.bru',
      `meta {
  name: Create Order
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/orders
  body: json
  auth: inherit
}

tags {
  smoke
  release-gate
}

tests {
  test("returns 201", function() {
    expect(res.getStatus()).to.equal(201);
  });
}
`,
    );

    expect(parsed).toEqual({
      name: 'Create Order',
      method: 'POST',
      relativePath: 'orders/create-order.bru',
      folderPath: 'orders',
      urlTemplate: '{{baseUrl}}/orders',
      tags: ['smoke', 'release-gate'],
      hasTests: true,
      hasScripts: false,
    });
  });

  it('falls back to filename when meta name is absent', () => {
    const parsed = parseBruRequestFile(
      'health.bru',
      `get {
  url: {{baseUrl}}/health
}
`,
    );

    expect(parsed.name).toBe('health');
    expect(parsed.method).toBe('GET');
    expect(parsed.folderPath).toBeNull();
  });
});
