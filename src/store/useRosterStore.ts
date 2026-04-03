import { create } from 'zustand'
import type { RosterPlayer } from '../types'

interface RosterState {
  awayRoster: RosterPlayer[]
  homeRoster: RosterPlayer[]
  setRoster: (team: 'away' | 'home', roster: RosterPlayer[]) => void
  clearRoster: (team: 'away' | 'home') => void
}

/** チーム選手名簿ストア。永続化・ブロードキャスト不要の揮発性ストア。 */
export const useRosterStore = create<RosterState>()((set) => ({
  awayRoster: [],
  homeRoster: [],
  setRoster: (team, roster) =>
    set(team === 'away' ? { awayRoster: roster } : { homeRoster: roster }),
  clearRoster: (team) =>
    set(team === 'away' ? { awayRoster: [] } : { homeRoster: [] }),
}))
