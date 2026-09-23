import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'

/**
 * Subscribes to search index status events from the main process.
 * Call once from App.tsx — mirrors the useAgentEvents / useHealthReconciliation pattern.
 */
export function useSearchEvents(): void {
  useEffect(() => {
    const cleanup = window.glui.onSearchIndexStatus((status) => {
      useSessionStore.getState().setSearchIndexStatus(status)
    })
    return cleanup
  }, [])
}
