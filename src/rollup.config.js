// rollup.config.js
import { posix } from 'path';

export default {
  plugins: [
    {
      name: 'windows-path-fix',
      resolveId(source, importer) {
        const resolved = posix.resolve(posix.dirname(importer), source);
        return resolved.startsWith('C:') ? `/${resolved}` : resolved;
      }
    }
  ]
};