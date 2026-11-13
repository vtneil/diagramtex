import { createBlocks } from './core/blocks';
import { runtime } from './runtime';
runtime.blocks = createBlocks(runtime.TYPES, (name, open) => {
  // Named editor aliases are retained only for the legacy callers.
  Object.assign(runtime, { [name]: open });
});
