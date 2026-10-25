/** A unilateral spring/damper contact, integrated implicitly to remain stable for light balls. */
export function compliantNormalForce(
  compression: number,
  separatingSpeed: number,
  stiffness: number,
  damping: number,
  inverseEffectiveMass: number,
  dt: number,
): number {
  if (compression <= 0 || stiffness <= 0) return 0;
  const resistance = damping + stiffness * dt;
  return Math.max(0, (stiffness * compression - resistance * separatingSpeed)
    / (1 + dt * resistance * inverseEffectiveMass));
}

/** Finite contact traction cannot exceed the friction supported by the compressed tread. */
export function compliantTractionForce(
  slipSpeed: number,
  normalForce: number,
  friction: number,
  inverseEffectiveMass: number,
  dt: number,
): number {
  if (normalForce <= 0 || friction <= 0 || inverseEffectiveMass <= 0 || dt <= 0) return 0;
  const impulseToMatchSpeed = slipSpeed / inverseEffectiveMass;
  const limit = friction * normalForce;
  return Math.max(-limit, Math.min(limit, impulseToMatchSpeed / dt));
}
