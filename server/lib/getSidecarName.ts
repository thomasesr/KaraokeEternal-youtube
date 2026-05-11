import fs from 'fs'
import getPerms from './getPermutations.js'

export default function getSidecarName (file: string, ext: string): string | false {
  // upper and lowercase permutations since fs may be case-sensitive
  for (const perm of getPerms(ext)) {
    const candidate = file.substring(0, file.lastIndexOf('.') + 1) + perm

    try {
      fs.statSync(candidate)
      return candidate
    } catch {
      // try next permutation
    }
  }

  return false
}
