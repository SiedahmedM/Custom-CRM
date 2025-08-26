interface CachedUser {
  id: string
  access_key_hash: string
  name: string
  role: 'admin' | 'driver'
  phone?: string
  email?: string
  cached_at: number
}

const CACHE_KEY = 'offline_user_cache'
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds

// Simple hash function for access key (for basic security)
const hashAccessKey = async (accessKey: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(accessKey + 'muffler_crm_salt')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

interface UserData {
  id: string
  name: string
  role: 'admin' | 'driver'
  phone?: string
  email?: string
}

export const cacheUserForOffline = async (user: UserData, accessKey: string): Promise<void> => {
  try {
    const hashedKey = await hashAccessKey(accessKey)
    const cachedUser: CachedUser = {
      id: user.id,
      access_key_hash: hashedKey,
      name: user.name,
      role: user.role,
      phone: user.phone,
      email: user.email,
      cached_at: Date.now()
    }
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedUser))
  } catch (error) {
    console.error('Failed to cache user for offline:', error)
  }
}

export const validateOfflineCredentials = async (accessKey: string): Promise<CachedUser | null> => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    
    const cachedUser: CachedUser = JSON.parse(cached)
    
    // Check if cache is expired
    if (Date.now() - cachedUser.cached_at > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    
    // Verify access key
    const hashedKey = await hashAccessKey(accessKey)
    if (hashedKey !== cachedUser.access_key_hash) {
      return null
    }
    
    return cachedUser
  } catch (error) {
    console.error('Failed to validate offline credentials:', error)
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

export const clearOfflineCache = (): void => {
  localStorage.removeItem(CACHE_KEY)
}