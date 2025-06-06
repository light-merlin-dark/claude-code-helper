export interface CommandResult<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface RuntimeContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface CommandSpec<T = any> {
  description: string;
  help: string;
  execute(
    args: string[],
    options: Record<string, any>,
    ctx: RuntimeContext
  ): Promise<CommandResult<T>>;
}