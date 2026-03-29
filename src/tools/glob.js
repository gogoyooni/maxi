import { glob as globSync } from 'glob';
import { join, isAbsolute } from 'path';

export class GlobTool {
  async execute(pattern, baseDir) {
    try {
      const fullPattern = isAbsolute(pattern) ? pattern : join(baseDir, pattern);
      const files = await globSync(fullPattern, { absolute: false });
      return { success: true, files };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
