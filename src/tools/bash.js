import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BashTool {
  async execute(command, workingDir) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });
      
      return {
        success: true,
        stdout: stdout || '(no output)',
        stderr: stderr || '',
      };
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code,
      };
    }
  }
}
