#!/usr/bin/env bun
import { writeFileSync } from 'fs';
import path from 'path';

/**
 * Generate test configuration files for comprehensive testing
 */

// Generate a large paste content for testing
function generateLargePaste(lines: number = 150): string {
  const codeLines = [
    'import { Component } from "react";',
    'import { useState, useEffect } from "react";',
    '',
    'interface Props {',
    '  data: any[];',
    '  onUpdate: (data: any[]) => void;',
    '}',
    '',
    'export const DataTable: React.FC<Props> = ({ data, onUpdate }) => {',
    '  const [sortColumn, setSortColumn] = useState<string | null>(null);',
    '  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");',
    '  const [filterText, setFilterText] = useState("");',
    '',
    '  useEffect(() => {',
    '    // Complex data processing logic here',
    '    const processedData = data.map((item, index) => ({',
    '      ...item,',
    '      id: item.id || index,',
    '      processed: true',
    '    }));',
    '    onUpdate(processedData);',
    '  }, [data, onUpdate]);',
    '',
    '  const handleSort = (column: string) => {',
    '    if (sortColumn === column) {',
    '      setSortDirection(sortDirection === "asc" ? "desc" : "asc");',
    '    } else {',
    '      setSortColumn(column);',
    '      setSortDirection("asc");',
    '    }',
    '  };'
  ];

  // Repeat and vary the content to reach desired line count
  const result = [];
  for (let i = 0; i < lines; i++) {
    const line = codeLines[i % codeLines.length];
    result.push(`${line} // Line ${i + 1}`);
  }
  
  return result.join('\n');
}

// Clean, minimal configuration
const cleanConfig = {
  version: 1,
  projects: {
    "clean-project": {
      workspacePath: "/Users/test/clean-project",
      bashCommands: [
        "npm:*",
        "git status",
        "git diff:*",
        "make:*"
      ],
      mcpServers: {
        "github": {
          type: "stdio",
          command: "github-mcp"
        }
      },
      history: []
    },
    "simple-api": {
      workspacePath: "/Users/test/simple-api",
      bashCommands: [
        "npm:*",
        "pytest:*",
        "git status"
      ],
      mcpServers: {},
      history: []
    }
  }
};

// Configuration with large pastes and bloat
const bloatedConfig = {
  version: 1,
  projects: {
    "db-metrics": {
      workspacePath: "/Users/test/db-metrics",
      bashCommands: ["npm:*", "docker:*"],
      mcpServers: {
        "github": {
          type: "stdio", 
          command: "github-mcp"
        }
      },
      history: [
        {
          role: "user",
          content: "Here's my database schema:",
          pastedContents: {
            "paste1": {
              filename: "schema.sql",
              content: generateLargePaste(200)
            }
          }
        },
        {
          role: "assistant", 
          content: "I'll help you optimize this schema."
        },
        {
          role: "user",
          content: "Here's the migration file:",
          pastedContents: {
            "paste2": {
              filename: "migration.sql",
              content: generateLargePaste(180)
            }
          }
        },
        {
          role: "user",
          content: "And here's the current metrics code:",
          pastedContents: {
            "paste3": {
              filename: "metrics.ts",
              content: generateLargePaste(150)
            },
            "paste4": {
              filename: "analytics.ts", 
              content: generateLargePaste(120)
            }
          }
        }
      ]
    },
    "frontend-app": {
      workspacePath: "/Users/test/frontend-app",
      bashCommands: ["npm:*", "yarn:*"],
      mcpServers: {},
      history: [
        {
          role: "user",
          content: "Here's my React component:",
          pastedContents: {
            "paste5": {
              filename: "Component.tsx",
              content: generateLargePaste(110)
            }
          }
        },
        {
          role: "user", 
          content: "And the styles:",
          pastedContents: {
            "paste6": {
              filename: "styles.css",
              content: generateLargePaste(95) // Just under 100 line threshold
            }
          }
        }
      ]
    }
  }
};

// Configuration with dangerous permissions
const dangerousConfig = {
  version: 1,
  projects: {
    "temp-scripts": {
      workspacePath: "/Users/test/temp-scripts",
      bashCommands: [
        "npm:*",
        "rm:*",  // Dangerous
        "sudo apt-get install:*"
      ],
      mcpServers: {},
      history: []
    },
    "system-admin": {
      workspacePath: "/Users/test/system-admin", 
      bashCommands: [
        "sudo:*",  // Dangerous
        "chmod:*",
        "systemctl:*"
      ],
      mcpServers: {},
      history: []
    },
    "dev-tools": {
      workspacePath: "/Users/test/dev-tools",
      bashCommands: [
        "eval:*",  // Dangerous
        "curl * | bash",  // Very dangerous
        "npm:*"
      ],
      mcpServers: {},
      history: []
    },
    "safe-project": {
      workspacePath: "/Users/test/safe-project",
      bashCommands: [
        "npm:*",
        "git status",
        "pytest:*"
      ],
      mcpServers: {},
      history: []
    }
  }
};

// Configuration with many projects for bulk operations testing
const multiProjectConfig = {
  version: 1,
  projects: {
    // Work projects
    "work/api-server": {
      workspacePath: "/Users/test/work/api-server",
      bashCommands: ["npm:*", "docker:*"],
      mcpServers: { "github": { type: "stdio", command: "github-mcp" } },
      history: []
    },
    "work/frontend": {
      workspacePath: "/Users/test/work/frontend", 
      bashCommands: ["npm:*", "yarn:*"],
      mcpServers: { "github": { type: "stdio", command: "github-mcp" } },
      history: []
    },
    "work/mobile-app": {
      workspacePath: "/Users/test/work/mobile-app",
      bashCommands: ["react-native:*", "pod:*"],
      mcpServers: {},
      history: []
    },
    
    // Personal projects
    "personal/blog": {
      workspacePath: "/Users/test/personal/blog",
      bashCommands: ["npm:*", "hugo:*"],
      mcpServers: {},
      history: []
    },
    "personal/scripts": {
      workspacePath: "/Users/test/personal/scripts", 
      bashCommands: ["python:*", "bash:*"],
      mcpServers: {},
      history: []
    },
    
    // API projects (for *-api pattern testing)
    "users-api": {
      workspacePath: "/Users/test/users-api",
      bashCommands: ["npm:*", "docker:*"],
      mcpServers: { "aia": { type: "stdio", command: "aia-mcp" } },
      history: []
    },
    "orders-api": {
      workspacePath: "/Users/test/orders-api",
      bashCommands: ["npm:*", "docker:*"], 
      mcpServers: { "aia": { type: "stdio", command: "aia-mcp" } },
      history: []
    },
    "payments-api": {
      workspacePath: "/Users/test/payments-api",
      bashCommands: ["npm:*", "docker:*"],
      mcpServers: { "aia": { type: "stdio", command: "aia-mcp" } },
      history: []
    },
    
    // Tool projects
    "build-tools": {
      workspacePath: "/Users/test/build-tools",
      bashCommands: ["make:*", "cmake:*"],
      mcpServers: {},
      history: []
    },
    "dev-tools": {
      workspacePath: "/Users/test/dev-tools",
      bashCommands: ["node:*", "bun:*"],
      mcpServers: {},
      history: []
    }
  }
};

// Complex configuration with nested projects and edge cases
const complexConfig = {
  version: 1,
  projects: {
    "nested/deep/project": {
      workspacePath: "/Users/test/nested/deep/project",
      bashCommands: ["npm:*"],
      mcpServers: {},
      history: []
    },
    "project-with-special-chars!@#": {
      workspacePath: "/Users/test/project-with-special-chars!@#",
      bashCommands: ["npm:*"],
      mcpServers: {},
      history: []
    },
    "empty-project": {
      workspacePath: "/Users/test/empty-project",
      bashCommands: [],
      mcpServers: {},
      history: []
    },
    "project-with-long-name-that-exceeds-normal-expectations": {
      workspacePath: "/Users/test/project-with-long-name-that-exceeds-normal-expectations",
      bashCommands: ["npm:*"],
      mcpServers: {
        "very-long-mcp-server-name-for-testing": {
          type: "stdio",
          command: "very-long-mcp-server-name-for-testing"
        }
      },
      history: [
        {
          role: "user",
          content: "Complex nested conversation",
          pastedContents: {
            "complex-paste": {
              filename: "complex-file.json",
              content: JSON.stringify({
                deeply: {
                  nested: {
                    object: {
                      with: {
                        many: {
                          levels: {
                            and: {
                              arrays: [1, 2, 3, { more: "nesting" }]
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }, null, 2).repeat(20) // Make it large
            }
          }
        }
      ]
    }
  }
};

// Write all test configurations
const configDir = path.join(__dirname, 'configs');

console.log('🧪 Generating test configuration files...\n');

const configs = [
  { name: 'claude-config-clean.json', data: cleanConfig, desc: 'Clean, minimal configuration' },
  { name: 'claude-config-bloated.json', data: bloatedConfig, desc: 'Configuration with large pastes' },
  { name: 'claude-config-dangerous.json', data: dangerousConfig, desc: 'Configuration with dangerous permissions' },
  { name: 'claude-config-multi-project.json', data: multiProjectConfig, desc: 'Many projects for bulk operations' },
  { name: 'claude-config-complex.json', data: complexConfig, desc: 'Complex edge cases and nested structures' }
];

for (const config of configs) {
  const filePath = path.join(configDir, config.name);
  writeFileSync(filePath, JSON.stringify(config.data, null, 2));
  
  const sizeKB = Math.round(JSON.stringify(config.data).length / 1024);
  console.log(`✓ ${config.name.padEnd(35)} ${sizeKB}KB - ${config.desc}`);
}

console.log(`\n🎯 Generated ${configs.length} test configuration files in tests/data/configs/`);
console.log('   These files provide comprehensive test scenarios for:');
console.log('   • Config bloat detection and cleanup');
console.log('   • Dangerous permission analysis');
console.log('   • Bulk operations across multiple projects');
console.log('   • Edge cases and error handling');
console.log('   • Pattern matching for project selection');