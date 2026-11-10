export const normalizeText = value => String(value || '')
  .toLocaleLowerCase('es')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export const matchesAlias = (value, candidate) => {
  const wanted = normalizeText(value)
  const normalizedCandidate = normalizeText(candidate)
  return wanted === normalizedCandidate || wanted.includes(normalizedCandidate) || normalizedCandidate.includes(wanted)
}
