import { setupGlobal } from '@mock-doc';

export const win = setupGlobal(global) as Window;

export const doc = win.document;
