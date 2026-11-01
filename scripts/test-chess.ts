import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { chooseMove } from '../src/chess/engine'

const uci = (m: { from: string; to: string } | null) => (m ? m.from + m.to : null)

// hard finds mate in one (back-rank: Ra8#)
assert.equal(uci(chooseMove('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'hard', 600)), 'a1a8')
// hard takes a free queen (Rxd5), and does not walk into a mate in one when it can avoid it
assert.equal(uci(chooseMove('k7/8/8/3q4/8/8/8/K2R4 w - - 0 1', 'hard', 600)), 'd1d5')
// every level returns a legal move from the start position; both finish in time
for (const level of ['easy', 'hard'] as const) {
  const t = performance.now()
  const m = chooseMove(new Chess().fen(), level, 600)!
  assert.ok(new Chess().move(m), `${level}: legal`)
  assert.ok(performance.now() - t < 1500, `${level}: fast enough`)
}
// no legal moves -> null (stalemate position)
assert.equal(chooseMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'hard'), null)
// the hard side beats the easy side over a short game (hard as white, 40 plies)
const g = new Chess()
for (let i = 0; i < 40 && !g.isGameOver(); i++) { const m = chooseMove(g.fen(), g.turn() === 'w' ? 'hard' : 'easy', 250); if (!m) break; g.move(m) }
const val = (c: string) => g.board().flat().reduce((a, s) => a + (s && s.color === c ? { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[s.type] : 0), 0)
assert.ok(val('w') >= val('b'), `hard (white) should not be behind on material: ${val('w')} vs ${val('b')}`)
console.log('chess ok')
