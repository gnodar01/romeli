import { chrome } from './chrome';
import { firefox } from './firefox';
import type { Platform } from './types';

/** The platform this bundle was built for. The other one is dropped by the bundler. */
export const platform: Platform = __TARGET__ === 'chrome' ? chrome : firefox;
