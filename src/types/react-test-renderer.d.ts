/**
 * Minimal typings for `react-test-renderer`.
 *
 * The package ships no types and `@types/react-test-renderer` is deprecated
 * upstream for React 19, so the surface the finance render tests use is
 * declared here instead of adding a dependency.
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export type ReactTestRendererJSON = {
    type: string;
    props: Record<string, unknown>;
    children: (ReactTestRendererJSON | string)[] | null;
  };

  export type ReactTestInstance = {
    type: unknown;
    props: Record<string, unknown>;
    parent: ReactTestInstance | null;
    children: (ReactTestInstance | string)[];
    find(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance;
    findAll(
      predicate: (node: ReactTestInstance) => boolean,
      options?: { deep?: boolean },
    ): ReactTestInstance[];
    findByType(type: unknown): ReactTestInstance;
    findAllByType(type: unknown, options?: { deep?: boolean }): ReactTestInstance[];
    findByProps(props: Record<string, unknown>): ReactTestInstance;
    findAllByProps(props: Record<string, unknown>, options?: { deep?: boolean }): ReactTestInstance[];
  };

  export type ReactTestRenderer = {
    toJSON(): ReactTestRendererJSON | ReactTestRendererJSON[] | null;
    toTree(): unknown;
    update(element: ReactElement): void;
    unmount(): void;
    getInstance(): unknown;
    root: ReactTestInstance;
  };

  export type TestRendererOptions = {
    createNodeMock?: (element: ReactElement) => unknown;
  };

  export function create(element: ReactElement, options?: TestRendererOptions): ReactTestRenderer;

  export function act(callback: () => void): void;
  export function act(callback: () => Promise<void>): Promise<void>;

  const TestRenderer: {
    create: typeof create;
    act: typeof act;
  };

  export default TestRenderer;
}
