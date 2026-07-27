export function damageCalcRaw(
  eff: number,
  cr: number,
  atk: number,
  def: number,
  stab: number,
  mdf: number,
  rollp: number
): number {
  let coef4 = 1
  if (stab > 0) {
    coef4 = (100 + stab) / 100
  } else {
    coef4 = 100 / (100 - stab)
  }
  let coef5 = 1
  if (mdf > 0) {
    coef5 = (2 + mdf) / 2
  } else {
    coef5 = 2 / (2 - mdf)
  }
  return Math.max(0, Math.floor((eff * cr * atk * coef4 * coef5 * rollp) / 10000 / def))
}

export function handleHP(
  hp: number[],
  maxhp: number,
  delta: number[],
  shieldDamageRatio: number = 1,
  stackShield: boolean = false
): number[] {
  const cur = hp[0]
  let tmp = stackShield && delta[1] > 0 ? Math.max(0, hp[1]) + delta[1] : Math.max(hp[1], delta[1])
  let real = cur
  if (delta[0] < 0) {
    const damage = -delta[0]
    const ratio = Math.max(1, Math.floor(Number(shieldDamageRatio) || 1))
    const shieldAbsorbedDamage = Math.min(damage, tmp > 0 ? Math.ceil(tmp / ratio) : 0)
    const shieldLoss = Math.min(tmp, damage * ratio)
    tmp -= shieldLoss
    real -= damage - shieldAbsorbedDamage
  } else {
    real += delta[0]
  }
  // Damage must be subtracted from the actual current HP, even when a
  // temporary max-HP reduction leaves current HP above the new maximum.
  // Healing is capped at max HP. If a temporary max-HP reduction leaves the
  // current HP above that cap, healing does nothing instead of increasing it
  // further (or reducing it back down to the cap).
  const nextHP = delta[0] > 0 ? (cur < maxhp ? Math.min(maxhp, real) : cur) : real
  return [nextHP, tmp]
}

export function showHP(hp: number[]): string {
  return `${hp[0]}${hp[1] != 0 ? '+' + hp[1] : ''}`
}
