declare module 'virtual:atlas' {
  /** Every sprite frame in one PNG, drawn when the game is built (see vite.config.ts). */
  const atlas: {
    image: string;
    frames: { name: string; x: number; y: number; size: number }[];
    anims: Record<string, { fps: number; count: number }>;
  };
  export default atlas;
}

/** When the game was built (see vite.config.ts). */
declare const __BUILD__: string;
