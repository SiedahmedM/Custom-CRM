export const checkConnectivity = async (): Promise<boolean> => {
  // First check navigator.onLine (basic check)
  if (!navigator.onLine) {
    return false
  }

  // Perform a actual network test with a lightweight request
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    const response = await fetch('/api/health', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-cache'
    })
    
    clearTimeout(timeoutId)
    return response.ok
  } catch {
    // Network error, DNS error, timeout, or abort
    return false
  }
}

export const isNetworkError = (error: unknown): boolean => {
  if (!error) return false
  
  const errorString = error.toString().toLowerCase()
  const errorMessage = (error as Error).message?.toLowerCase() || ''
  
  // Common network error indicators
  const networkErrorIndicators = [
    'network',
    'fetch',
    'connection',
    'timeout',
    'offline',
    'dns',
    'unreachable',
    'aborted',
    'failed to fetch'
  ]
  
  return networkErrorIndicators.some(indicator => 
    errorString.includes(indicator) || errorMessage.includes(indicator)
  )
}