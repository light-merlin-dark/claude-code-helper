/**
 * Service Registry - Lightweight dependency injection for Claude Code Helper
 * 
 * This provides a simple way to manage service dependencies without heavy frameworks.
 * Services can be registered as instances or factories for lazy instantiation.
 */

export class ServiceRegistry {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();
  private singletons = new Map<string, any>();

  /**
   * Register a service instance
   */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /**
   * Register a factory for lazy instantiation
   * @param singleton - If true (default), only one instance will be created
   */
  registerFactory<T>(name: string, factory: () => T, singleton = true): void {
    this.factories.set(name, factory);
    // Store whether this factory should create singletons
    if (!singleton) {
      this.singletons.set(name, false); // Mark as non-singleton
    }
  }

  /**
   * Get a service (lazy instantiation for factories)
   */
  get<T>(name: string): T {
    // Check if we have a direct service instance
    if (this.services.has(name)) {
      return this.services.get(name);
    }

    // Check if we have a factory
    if (this.factories.has(name)) {
      const factory = this.factories.get(name)!;
      const isNonSingleton = this.singletons.get(name) === false;

      // For singletons, check if already instantiated
      if (!isNonSingleton) {
        const existing = this.singletons.get(name);
        if (existing && existing !== false) {
          return existing;
        }
      }

      // Create new instance
      const instance = factory();
      
      // Store singleton instances
      if (!isNonSingleton) {
        this.singletons.set(name, instance);
      }
      
      return instance;
    }

    throw new Error(`Service not found: ${name}`);
  }

  /**
   * Check if service exists
   */
  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return [
      ...Array.from(this.services.keys()),
      ...Array.from(this.factories.keys())
    ].filter((value, index, self) => self.indexOf(value) === index);
  }

  /**
   * Clear all services (useful for testing)
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }

  /**
   * Create a scoped registry (inherits from parent)
   */
  createScope(): ServiceRegistry {
    const scoped = new ServiceRegistry();
    
    // Copy service references (not instances)
    for (const [name, service] of this.services) {
      scoped.services.set(name, service);
    }
    
    // Copy factory references
    for (const [name, factory] of this.factories) {
      scoped.factories.set(name, factory);
    }
    
    return scoped;
  }
}

// Global registry instance
export const registry = new ServiceRegistry();

// Service name constants to avoid typos
export const ServiceNames = {
  CONFIG: 'config',
  LOGGER: 'logger',
  STATE: 'state',
  SAFETY: 'safety',
  EXECUTOR: 'executor',
  PERMISSION_MANAGER: 'permissionManager',
  PROJECT_SCANNER: 'projectScanner',
  MCP_MANAGER: 'mcpManager',
  PROMPT: 'prompt',
} as const;

export type ServiceName = typeof ServiceNames[keyof typeof ServiceNames];