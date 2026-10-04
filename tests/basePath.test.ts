const { normalizeBasePath } = require('../src/core/basePath');
const { panelSettings } = require('../src/middleware/validators');

describe('installation base path', () => {
    test.each([['/', '/'], ['/panel', '/panel/'], [' /panel/ ', '/panel/'], ['/mine-panel/v2_admin', '/mine-panel/v2_admin/']])('normalizes %s', (input, expected) => {
        expect(normalizeBasePath(input)).toBe(expected);
        expect(panelSettings.validate({ basePath: input }).error).toBeUndefined();
    });
    test.each(['', 'panel', '//panel/', '/panel//', '/../', '/a/../b', '/a?b', '/a#b', '/a%2fb', '/a\\b', 'https://host/panel/', '/:route/', '/<script>/'])('rejects unsafe path %s', input => {
        expect(() => normalizeBasePath(input)).toThrow();
        expect(panelSettings.validate({ basePath: input }).error).toBeDefined();
    });
});
