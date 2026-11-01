import { Chess, type Move } from 'chess.js'

export type Level = 'easy' | 'hard'
export interface Pick { from: string; to: string; promotion?: string }

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
const MATE = 100000

// Piece-square tables from white's point of view, a8..h1 (the classic "simplified evaluation function").
const PST: Record<string, number[]> = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
}

/** Static evaluation in centipawns from the side to move's point of view. */
function evaluate(ch: Chess): number {
  let score = 0
  ch.board().forEach((row, r) => row.forEach((sq, c) => {
    if (!sq) return
    const v = VAL[sq.type] + PST[sq.type][sq.color === 'w' ? r * 8 + c : (7 - r) * 8 + c]
    score += sq.color === 'w' ? v : -v
  }))
  return ch.turn() === 'w' ? score : -score
}

/** MVV-LVA ordering: look at captures of valuable pieces by cheap ones first. */
const order = (moves: Move[]) => moves
  .map((m) => ({ m, s: (m.captured ? VAL[m.captured] * 10 - VAL[m.piece] : 0) + (m.promotion ? 800 : 0) }))
  .sort((a, b) => b.s - a.s).map((x) => x.m)

const play = (ch: Chess, m: Move) => ch.move({ from: m.from, to: m.to, promotion: m.promotion })

interface Ctx { deadline: number; nodes: number; aborted: boolean }

function quiesce(ch: Chess, alpha: number, beta: number, ctx: Ctx, depth: number): number {
  const stand = evaluate(ch)
  if (stand >= beta || depth === 0) return stand // stand pat: the side to move may decline every capture
  alpha = Math.max(alpha, stand)
  for (const m of order(ch.moves({ verbose: true }).filter((x) => x.captured || x.promotion))) {
    play(ch, m)
    const s = -quiesce(ch, -beta, -alpha, ctx, depth - 1)
    ch.undo()
    if (s >= beta) return s
    if (s > alpha) alpha = s
  }
  return alpha
}

function negamax(ch: Chess, depth: number, alpha: number, beta: number, ctx: Ctx, ply: number): number {
  if (++ctx.nodes % 256 === 0 && performance.now() > ctx.deadline) ctx.aborted = true
  if (ctx.aborted) return 0
  if (depth === 0) return quiesce(ch, alpha, beta, ctx, 4)
  const moves = ch.moves({ verbose: true })
  if (!moves.length) return ch.inCheck() ? -MATE + ply : 0 // mate (sooner is better for the winner) or stalemate
  for (const m of order(moves)) {
    play(ch, m)
    const s = -negamax(ch, depth - 1, -beta, -alpha, ctx, ply + 1)
    ch.undo()
    if (ctx.aborted) return 0
    if (s >= beta) return s
    if (s > alpha) alpha = s
  }
  return alpha
}

const pick = (m: Move): Pick => ({ from: m.from, to: m.to, promotion: m.promotion })

/** Easy: often a random move, otherwise the best 1-ply greedy move with noise; it never looks at replies, so it hangs pieces. */
function easy(ch: Chess): Pick {
  const moves = ch.moves({ verbose: true })
  if (Math.random() < 0.3) return pick(moves[Math.floor(Math.random() * moves.length)])
  let best = moves[0], bs = -Infinity
  for (const m of moves) {
    play(ch, m)
    const s = -evaluate(ch) + (Math.random() - 0.5) * 120
    ch.undo()
    if (s > bs) { bs = s; best = m }
  }
  return pick(best)
}

/** Hard: iterative-deepening alpha-beta with quiescence, up to 4 plies, stops at the time limit and keeps the last finished depth. */
function hard(ch: Chess, ms: number): Pick {
  const root = order(ch.moves({ verbose: true }))
  let best = root[0]
  const ctx: Ctx = { deadline: performance.now() + ms, nodes: 0, aborted: false }
  for (let depth = 1; depth <= 4; depth++) {
    let alpha = -Infinity, iterBest = root[0]
    for (const m of root) {
      play(ch, m)
      const s = -negamax(ch, depth - 1, -Infinity, -alpha, ctx, 1)
      ch.undo()
      if (ctx.aborted) break
      if (s > alpha) { alpha = s; iterBest = m }
    }
    if (ctx.aborted) break
    best = iterBest
    root.splice(root.indexOf(best), 1); root.unshift(best) // search the previous best first at the next depth
    if (alpha > MATE / 2) break // forced mate found
  }
  return pick(best)
}

/** Choose a reply for the side to move; null if there is no legal move. */
export function chooseMove(fen: string, level: Level, ms = 1300): Pick | null {
  const ch = new Chess(fen)
  if (!ch.moves().length) return null
  return level === 'easy' ? easy(ch) : hard(ch, ms)
}
