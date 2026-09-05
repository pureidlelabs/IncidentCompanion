/**
 * Triggers a same-tab download of `blob` as `filename`, through an offscreen
 * anchor and object URL.
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
