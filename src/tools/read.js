import { readFile } from 'fs/promises';
import { join, isAbsolute } from 'path';

export class FileReadTool {
  async execute(filePath, baseDir) {
    try {
      const fullPath = isAbsolute(filePath) ? filePath : join(baseDir, filePath);
      const content = await readFile(fullPath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
