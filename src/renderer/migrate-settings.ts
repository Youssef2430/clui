// Copy legacy settings once; leave the original keys intact for rollback.
try {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('clui-')) {
      const next = key.replace(/^clui-/, 'glui-')
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key)!)
    }
  }
} catch {}
