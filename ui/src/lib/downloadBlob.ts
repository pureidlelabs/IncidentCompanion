/**
 * Triggers a same-tab download of `blob` as `filename`, through an offscreen
 * anchor and object URL. Shared by the CSV template download and the case
 * archive export - both build bytes over an API response and need the same
 * three-line trigger.
 *
 * **Every DOM constructor is injectable**: jsdom's
 * `URL.createObjectURL` is a stub with no way to read back what it was called
 * with, so a test asserting the filename or blob has to supply its own.
 */

export interface DownloadDeps {
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
  createAnchor: () => HTMLAnchorElement
  appendChild: (element: HTMLElement) => void
}

function defaultDeps(): DownloadDeps {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => {
      URL.revokeObjectURL(url)
    },
    createAnchor: () => document.createElement('a'),
    appendChild: (element) => {
      document.body.appendChild(element)
    },
  }
}

export function downloadBlob(blob: Blob, filename: string, deps: Partial<DownloadDeps> = {}): void {
  const { createObjectURL, revokeObjectURL, createAnchor, appendChild } = { ...defaultDeps(), ...deps }
  const url = createObjectURL(blob)
  const anchor = createAnchor()
  anchor.href = url
  anchor.download = filename
  appendChild(anchor)
  anchor.click()
  anchor.remove()
  revokeObjectURL(url)
}
