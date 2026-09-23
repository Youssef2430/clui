import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Square } from '@phosphor-icons/react'
import { useColors } from '../theme'
import { useSessionStore } from '../stores/sessionStore'

export function RunActivity({ tabId, activity, canInterrupt }: { tabId: string; activity: string; canInterrupt: boolean }) {
  const colors = useColors()
  const reducedMotion = useReducedMotion()
  const pending = useRef(false)
  const [stopping, setStopping] = useState(false)
  const stop = async () => {
    if (pending.current) return
    pending.current = true
    setStopping(true)
    try {
      const accepted = await window.glui.stopTab(tabId)
      if (!accepted) throw new Error('Could not interrupt this task. Please try again.')
      // Keep the acknowledgement visible until the run snapshot confirms it stopped.
    } catch (error) {
      pending.current = false
      setStopping(false)
      useSessionStore.getState().addSystemMessage(error instanceof Error ? error.message : String(error), tabId)
    }
  }
  return (
    <motion.div className="run-activity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
      <span className="run-activity-status" role="status" aria-live="polite" style={{ color: colors.textSecondary }}>
        <span className={`run-wave${stopping ? ' is-stopping' : ''}`} aria-hidden="true" style={{ color: colors.statusRunning }}>
          {[0, 1, 2, 3].map(index => <span key={index} style={{ animationDelay: `${index * -0.19}s` }} />)}
        </span>
        <span className="run-activity-label">{stopping ? 'Stopping…' : (activity || 'Working').replace(/(?:\.{3}|…)$/, '')}</span>
      </span>
      {canInterrupt && (
        <motion.button type="button" className="run-interrupt" onClick={stop} disabled={stopping}
          whileHover={reducedMotion || stopping ? undefined : { scale: 1.03 }}
          whileTap={reducedMotion ? undefined : { scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          style={{ color: stopping ? colors.textTertiary : colors.statusError, background: colors.surfaceHover, borderColor: colors.toolBorder }}
          title="Stop current task" aria-label={stopping ? 'Stopping current task' : 'Interrupt current task'}>
          {stopping ? <span className="run-stop-spinner" aria-hidden="true" /> : <Square size={9} weight="fill" />}
          <span>{stopping ? 'Stopping' : 'Interrupt'}</span>
        </motion.button>
      )}
    </motion.div>
  )
}
