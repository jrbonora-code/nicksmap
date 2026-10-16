// The installed React DOM runtime is used only for the map popup portal here.
// Keep this narrow declaration local rather than adding a dependency for one API.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
