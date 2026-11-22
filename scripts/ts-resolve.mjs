// node --experimental-strip-types --import ./scripts/ts-resolve.mjs <test>
// Lets tests import the app's TypeScript modules as written (extensionless relative imports, as the bundler allows).
import { register } from 'node:module';
register('./ts-resolve-hooks.mjs', import.meta.url);
