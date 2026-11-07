export const OPERATION_QUEUED = 'caja:operation-queued'

export function notifyOperationQueued(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPERATION_QUEUED))
  }
}
