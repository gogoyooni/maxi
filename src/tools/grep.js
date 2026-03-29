import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GrepTool {
  async execute(pattern, include, baseDir) {
    try {
      let cmd = `grep -rn "${pattern}" "${baseDir}"`;
      
      if (include) {
        cmd = `grep -rn --include="${include}" "${pattern}" "${baseDir}"`;
      }
      
      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      
      const results = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [file, ...rest] = line.split(':');
        const lineNum = rest.slice(0, -1).join(':');
        const content = rest.slice(-1)[0] || '';
        return { file, line: lineNum, content };
      });
      
      return { success: true, results };
    } catch (error) {
      if (error.stdout) {
        const results = error.stdout.trim().split('\n').filter(Boolean).map(line => {
          const [file, ...rest] = line.split(':');
          const lineNum = rest.slice(0, -1).join(':');
          const content = rest.slice(-1)[0] || '';
          return { file, line: lineNum, content };
        });
        return { success: true, results };
      }
      return { success: false, error: error.message };
    }
  }
}
