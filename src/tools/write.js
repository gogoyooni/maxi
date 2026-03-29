import { writeFile } from 'fs/promises';
import { join, isAbsolute, dirname } from 'path';
import { mkdir } from 'fs/promises';

export class FileWriteTool {
  async execute(filePath, content, baseDir) {
    try {
      const fullPath = isAbsolute(filePath) ? filePath : join(baseDir, filePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      return { success: true, message: `Written to ${fullPath}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
