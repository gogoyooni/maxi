import { readFile } from 'fs/promises';
import { join, isAbsolute } from 'path';

export class EditTool {
  async execute(filePath, oldString, newString, baseDir) {
    try {
      const fullPath = isAbsolute(filePath) ? filePath : join(baseDir, filePath);
      const content = await readFile(fullPath, 'utf-8');
      
      if (!content.includes(oldString)) {
        return { success: false, error: 'String not found in file' };
      }
      
      const newContent = content.replace(oldString, newString);
      const { writeFile } = await import('fs/promises');
      await writeFile(fullPath, newContent, 'utf-8');
      
      return { success: true, message: `Edited ${fullPath}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
