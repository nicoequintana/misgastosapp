import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Limpia el DOM montado entre tests: sin esto, `render()` en distintos `it()`
// del mismo archivo acumula nodos y rompe queries como getByText por duplicados.
afterEach(() => {
  cleanup();
});
