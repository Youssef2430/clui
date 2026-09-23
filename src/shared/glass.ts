export interface GlassSurface { id: number; x: number; y: number; width: number; height: number; radius: number; opacity: number }
export interface GlassUpdate { dark: boolean; surfaces: GlassSurface[] }
