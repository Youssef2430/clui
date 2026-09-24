import React from 'react'
import { useColors } from '../theme'
export function ProviderPicker() {
  const colors = useColors()
  return <span className="glui-wordmark" style={{ color: colors.accent }}>glui<span style={{ opacity: .5 }}>.</span></span>
}
