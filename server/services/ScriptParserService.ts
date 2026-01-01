import { ScriptFileInfo, ParsedTestCase } from './RepositoryService.js';

/**
 * 脚本解析服务
 * 支持解析 JavaScript、Python、Java 等不同类型的测试脚本
 */
export class ScriptParserService {
  /**
   * 解析脚本文件
   */
  async parseScript(scriptFile: ScriptFileInfo, scriptType: string): Promise<ParsedTestCase[]> {
    switch (scriptType) {
      case 'javascript':
        return this.parseJavaScript(scriptFile);
      case 'python':
        return this.parsePython(scriptFile);
      case 'java':
        return this.parseJava(scriptFile);
      default:
        return this.parseGeneric(scriptFile);
    }
  }

  /**
   * 解析 JavaScript/TypeScript 脚本
   * 支持 describe/it 语法（Jest、Mocha 等）
   */
  private parseJavaScript(scriptFile: ScriptFileInfo): ParsedTestCase[] {
    const cases: ParsedTestCase[] = [];
    const content = scriptFile.content;

    // 匹配 describe 块
    const describeRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\(\)\s*=>\s*\{/g;
    const itRegex = /it\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:async\s*)?\(\)\s*=>\s*\{/g;

    let describeMatch;
    const describes: Array<{ name: string; startIndex: number; endIndex: number }> = [];

    // 找出所有 describe 块
    while ((describeMatch = describeRegex.exec(content)) !== null) {
      const name = describeMatch[1];
      const startIndex = describeMatch.index;

      // 简单的括号匹配来找到 describe 块的结束位置
      let braceCount = 1;
      let endIndex = startIndex + describeMatch[0].length;

      for (let i = endIndex; i < content.length && braceCount > 0; i++) {
        if (content[i] === '{') braceCount++;
        else if (content[i] === '}') braceCount--;
        endIndex = i;
      }

      describes.push({ name, startIndex, endIndex });
    }

    // 解析每个 describe 块内的 it 块
    for (const describe of describes) {
      const describeContent = content.substring(describe.startIndex, describe.endIndex);
      let itMatch;

      while ((itMatch = itRegex.exec(describeContent)) !== null) {
        const testName = itMatch[1];
        cases.push({
          name: `${describe.name} - ${testName}`,
          description: `Test case from ${scriptFile.path}`,
          module: describe.name,
          type: 'api',
          priority: 'P1',
          tags: ['auto-imported', 'javascript'],
          configJson: {
            scriptPath: scriptFile.path,
            framework: 'jest',
          },
        });
      }

      // 重置正则表达式
      itRegex.lastIndex = 0;
    }

    // 如果没有找到 describe 块，尝试直接找 it 块
    if (cases.length === 0) {
      let itMatch;
      while ((itMatch = itRegex.exec(content)) !== null) {
        const testName = itMatch[1];
        cases.push({
          name: testName,
          description: `Test case from ${scriptFile.path}`,
          type: 'api',
          priority: 'P1',
          tags: ['auto-imported', 'javascript'],
          configJson: {
            scriptPath: scriptFile.path,
            framework: 'jest',
          },
        });
      }
    }

    // 如果仍然没有找到任何测试，创建一个基于文件名的用例
    if (cases.length === 0) {
      const fileName = scriptFile.path.split('/').pop() || 'unknown';
      cases.push({
        name: `${fileName} - Default Test`,
        description: `Auto-generated test case from ${scriptFile.path}`,
        type: 'api',
        priority: 'P2',
        tags: ['auto-imported', 'javascript', 'generated'],
        configJson: {
          scriptPath: scriptFile.path,
        },
      });
    }

    return cases;
  }

  /**
   * 解析 Python 脚本
   * 支持 unittest 和 pytest 语法
   */
  private parsePython(scriptFile: ScriptFileInfo): ParsedTestCase[] {
    const cases: ParsedTestCase[] = [];
    const content = scriptFile.content;

    // 匹配 class TestXxx(unittest.TestCase):
    const classRegex = /class\s+(\w+)\s*\(\s*(?:unittest\.TestCase|object)\s*\)\s*:/g;
    const defRegex = /def\s+(test_\w+)\s*\(/g;

    let classMatch;
    while ((classMatch = classRegex.exec(content)) !== null) {
      const className = classMatch[1];
      const classContent = content.substring(classMatch.index);

      let defMatch;
      while ((defMatch = defRegex.exec(classContent)) !== null) {
        const methodName = defMatch[1];
        cases.push({
          name: `${className}::${methodName}`,
          description: `Test case from ${scriptFile.path}`,
          module: className,
          type: 'api',
          priority: 'P1',
          tags: ['auto-imported', 'python', 'unittest'],
          configJson: {
            scriptPath: scriptFile.path,
            framework: 'unittest',
          },
        });

        // 只取第一个方法作为示例
        break;
      }

      defRegex.lastIndex = 0;
    }

    // 如果没有找到 unittest 类，尝试找 pytest 风格的函数
    if (cases.length === 0) {
      const pytestRegex = /def\s+(test_\w+)\s*\(/g;
      let match;

      while ((match = pytestRegex.exec(content)) !== null) {
        const funcName = match[1];
        cases.push({
          name: funcName,
          description: `Test case from ${scriptFile.path}`,
          type: 'api',
          priority: 'P1',
          tags: ['auto-imported', 'python', 'pytest'],
          configJson: {
            scriptPath: scriptFile.path,
            framework: 'pytest',
          },
        });
      }
    }

    // 如果仍然没有找到任何测试
    if (cases.length === 0) {
      const fileName = scriptFile.path.split('/').pop() || 'unknown';
      cases.push({
        name: `${fileName} - Default Test`,
        description: `Auto-generated test case from ${scriptFile.path}`,
        type: 'api',
        priority: 'P2',
        tags: ['auto-imported', 'python', 'generated'],
        configJson: {
          scriptPath: scriptFile.path,
        },
      });
    }

    return cases;
  }

  /**
   * 解析 Java 脚本
   * 支持 JUnit 语法
   */
  private parseJava(scriptFile: ScriptFileInfo): ParsedTestCase[] {
    const cases: ParsedTestCase[] = [];
    const content = scriptFile.content;

    // 匹配 public class TestXxx
    const classRegex = /public\s+class\s+(\w+)/g;
    const methodRegex = /@Test\s+public\s+(?:void|String|int|boolean)\s+(\w+)\s*\(/g;

    let classMatch = classRegex.exec(content);
    if (classMatch) {
      const className = classMatch[1];

      let methodMatch;
      while ((methodMatch = methodRegex.exec(content)) !== null) {
        const methodName = methodMatch[1];
        cases.push({
          name: `${className}::${methodName}`,
          description: `Test case from ${scriptFile.path}`,
          module: className,
          type: 'api',
          priority: 'P1',
          tags: ['auto-imported', 'java', 'junit'],
          configJson: {
            scriptPath: scriptFile.path,
            framework: 'junit',
          },
        });
      }
    }

    // 如果没有找到任何测试
    if (cases.length === 0) {
      const fileName = scriptFile.path.split('/').pop() || 'unknown';
      cases.push({
        name: `${fileName} - Default Test`,
        description: `Auto-generated test case from ${scriptFile.path}`,
        type: 'api',
        priority: 'P2',
        tags: ['auto-imported', 'java', 'generated'],
        configJson: {
          scriptPath: scriptFile.path,
        },
      });
    }

    return cases;
  }

  /**
   * 通用解析（当脚本类型未知时）
   * 基于文件内容的启发式解析
   */
  private parseGeneric(scriptFile: ScriptFileInfo): ParsedTestCase[] {
    // 简单地根据文件名生成一个用例
    const fileName = scriptFile.path.split('/').pop() || 'unknown';
    return [
      {
        name: `${fileName} - Test`,
        description: `Auto-generated test case from ${scriptFile.path}`,
        type: 'api',
        priority: 'P2',
        tags: ['auto-imported', 'generated'],
        configJson: {
          scriptPath: scriptFile.path,
        },
      },
    ];
  }
}

// 导出单例
export const scriptParserService = new ScriptParserService();