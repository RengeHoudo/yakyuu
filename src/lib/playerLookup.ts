export function normalizeLookupText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s・.．]/g, '')
}

// NFKCでは統一されない字体を照合時だけ揃える（表示名は変更しない）。
const PLAYER_NAME_VARIANTS: Record<string, string> = {
  髙: '高', 﨑: '崎', 齋: '斎', 澤: '沢', 邊: '辺', 縣: '県',
}

export function normalizePlayerLookupName(value: string): string {
  return normalizeLookupText(value).replace(/[髙﨑齋澤邊縣]/g, (char) => PLAYER_NAME_VARIANTS[char]!)
}
