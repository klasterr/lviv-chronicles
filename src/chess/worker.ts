import { chooseMove, type Level } from './engine'

// The search runs here so a thinking grandpa never freezes the 3D scene.
self.onmessage = (e: MessageEvent<{ id: number; fen: string; level: Level }>) => {
  const { id, fen, level } = e.data
  self.postMessage({ id, move: chooseMove(fen, level) })
}
