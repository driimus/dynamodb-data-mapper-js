/**
 * A constructor that takes no arguments.
 */
export type ZeroArgumentsConstructor<T> = new () => T;

export type ClassAnnotation = (target: ZeroArgumentsConstructor<any>) => void;

export type PropertyAnnotation = (target: any, propertyKey: string | symbol) => void;
