import path from 'path';
import chalk from 'chalk';
import { loadClaudeConfig } from '../../core/config';
import { logger } from '../../utils/logger';
import { promptUser } from '../../utils/prompt';

interface McpToolFrequency {
  tool: string;
  count: number;
  projects: string[];
}

/**
 * Discover and suggest commonly used MCP tools across projects
 */
export async function discoverMcpTools(testMode: boolean = false): Promise<void> {
  const config = await loadClaudeConfig(testMode);

  if (!config.projects || Object.keys(config.projects).length === 0) {
    logger.warning('No projects found in Claude config');
    return;
  }

  // Count frequency of each MCP tool across projects
  const mcpToolMap = new Map<string, McpToolFrequency>();
  let totalProjects = 0;

  for (const [projectPath, project] of Object.entries(config.projects)) {
    totalProjects++;
    const seenInProject = new Set<string>();

    for (const tool of project.allowedTools || []) {
      // Check if it's an MCP tool (contains mcp__)
      if (!tool.includes('mcp__')) continue;
      
      // Normalize tool (remove Bash() wrapper if present)
      const normalizedTool = tool.startsWith('Bash(') && tool.endsWith(')') 
        ? tool.slice(5, -1) 
        : tool;
      
      // Skip if we've already seen this tool in this project
      if (seenInProject.has(normalizedTool)) continue;
      seenInProject.add(normalizedTool);

      // Update frequency map
      if (!mcpToolMap.has(normalizedTool)) {
        mcpToolMap.set(normalizedTool, { 
          tool: normalizedTool, 
          count: 0, 
          projects: [] 
        });
      }
      const freq = mcpToolMap.get(normalizedTool)!;
      freq.count++;
      freq.projects.push(path.basename(projectPath));
    }
  }

  // Sort by frequency and filter (3+ projects for MCP tools)
  const suggestions = Array.from(mcpToolMap.values())
    .filter(f => f.count >= 3) // Higher threshold for MCP tools
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Limit to top 10 suggestions

  if (suggestions.length === 0) {
    logger.info(`Analyzed ${totalProjects} project(s)`);
    logger.success('No frequently used MCP tools found that are used in 3+ projects');
    return;
  }

  // Display suggestions
  console.log(chalk.cyan(`\nLooking for commonly used MCP tools across ${totalProjects} projects...\n`));
  console.log(chalk.green(`Found ${suggestions.length} MCP tool(s) you use frequently:\n`));

  suggestions.forEach((tool, idx) => {
    const projectList = tool.projects.slice(0, 3).join(', ');
    const moreProjects = tool.projects.length > 3 ? ` (+${tool.projects.length - 3} more)` : '';
    console.log(`  ${chalk.yellow(`${idx + 1}.`)} ${chalk.white(tool.tool)} ${chalk.gray(`(used in ${tool.count} projects)`)} ${chalk.gray(`${projectList}${moreProjects}`)}`);
  });

  console.log('\n' + chalk.cyan('Select MCP tools to apply:'));
  console.log(`  ${chalk.gray('[a]')} Apply all`);
  console.log(`  ${chalk.gray('[1-' + suggestions.length + ']')} Select specific (comma-separated)`);
  console.log(`  ${chalk.gray('[n]')} Skip\n`);

  const answer = await promptUser('Your choice: ');

  if (answer === 'n' || answer === 'skip' || answer === '') {
    logger.info('Skipped applying MCP tools');
    return;
  }

  // TODO: Implement MCP tool application logic
  logger.info('MCP tool application not yet implemented');
}