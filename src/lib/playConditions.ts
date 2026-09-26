import type { GameState } from '../types'

type PlaySituation = Pick<GameState, 'count' | 'runners'>

export function canRecordInfieldFly({ count, runners }: PlaySituation): boolean {
  return count.outs < 2 && runners.first && runners.second
}

export function canRecordUncaughtThirdStrike({ count, runners }: PlaySituation): boolean {
  return count.strikes === 2 && (!runners.first || count.outs === 2)
}
