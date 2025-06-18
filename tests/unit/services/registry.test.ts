/**
 * Tests for Service Registry
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { ServiceRegistry } from '../../../src/registry';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  test('should register and retrieve services', () => {
    const mockService = { name: 'test' };
    registry.register('test', mockService);
    
    expect(registry.has('test')).toBe(true);
    expect(registry.get('test')).toBe(mockService);
  });

  test('should throw error for non-existent service', () => {
    expect(() => registry.get('nonexistent')).toThrow('Service not found: nonexistent');
  });

  test('should register and create factories', () => {
    let createCount = 0;
    const factory = () => {
      createCount++;
      return { id: createCount };
    };

    registry.registerFactory('factory', factory);
    
    const instance1 = registry.get('factory');
    const instance2 = registry.get('factory');
    
    expect(instance1).toBe(instance2); // Singleton by default
    expect(createCount).toBe(1);
  });

  test('should create new instances for non-singleton factories', () => {
    let createCount = 0;
    const factory = () => {
      createCount++;
      return { id: createCount };
    };

    registry.registerFactory('factory', factory, false);
    
    const instance1 = registry.get<any>('factory');
    const instance2 = registry.get<any>('factory');
    
    expect(instance1).not.toBe(instance2);
    expect(instance1.id).toBe(1);
    expect(instance2.id).toBe(2);
    expect(createCount).toBe(2);
  });

  test('should list all service names', () => {
    registry.register('service1', {});
    registry.registerFactory('service2', () => ({}));
    
    const names = registry.getServiceNames();
    expect(names).toContain('service1');
    expect(names).toContain('service2');
    expect(names.length).toBe(2);
  });

  test('should clear all services', () => {
    registry.register('service1', {});
    registry.registerFactory('service2', () => ({}));
    
    registry.clear();
    
    expect(registry.getServiceNames().length).toBe(0);
    expect(registry.has('service1')).toBe(false);
    expect(registry.has('service2')).toBe(false);
  });

  test('should create scoped registry', () => {
    const parentService = { name: 'parent' };
    registry.register('parent', parentService);
    
    const scoped = registry.createScope();
    
    // Should inherit parent services
    expect(scoped.get('parent')).toBe(parentService);
    
    // Should allow own services
    const scopedService = { name: 'scoped' };
    scoped.register('scoped', scopedService);
    
    expect(scoped.has('scoped')).toBe(true);
    expect(registry.has('scoped')).toBe(false); // Parent doesn't have scoped service
  });
});