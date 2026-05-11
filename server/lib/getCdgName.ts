import getSidecarName from './getSidecarName.js'

export default function getCdgName (file: string): string | false {
  return getSidecarName(file, 'cdg')
}
