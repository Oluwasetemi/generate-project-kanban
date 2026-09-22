declare module 'react' {
  export function useState<T>(initial: T): [T, (value: T | ((current: T) => T)) => void]
  export function useRef<T>(initial: T): { current: T }
}
