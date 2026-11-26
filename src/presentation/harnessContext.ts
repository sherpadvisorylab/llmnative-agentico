// CR-024: the harness of the host (`<AgenticoProvider harness>`), read by useAgent and by the composer that starts a chat.
import { createContext, useContext } from 'react';
import type { AgenticoHarness } from '../domain/harness';

export const AgenticoHarnessContext = createContext<AgenticoHarness | null>(null);

/** The harness of the host; null without one. */
export function useAgenticoHarness(): AgenticoHarness | null {
    return useContext(AgenticoHarnessContext);
}
