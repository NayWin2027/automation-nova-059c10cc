import { useState, useEffect, useCallback } from 'react';

/**
 * Secure API Key Storage Hook
 * 
 * Uses sessionStorage instead of localStorage for user API keys:
 * - Keys are cleared when browser tab/window closes
 * - Keys don't persist between sessions (more secure)
 * - Keys are still accessible during the current session
 * 
 * This prevents long-term exposure of user API keys while maintaining usability.
 */
export function useSecureApiKey(storageKey: string) {
  // Initialize from sessionStorage (not localStorage)
  const [apiKey, setApiKeyState] = useState<string>(() => {
    // Check sessionStorage first
    const sessionKey = sessionStorage.getItem(storageKey);
    if (sessionKey) return sessionKey;
    
    // Migration: If there's an old localStorage key, move it to sessionStorage
    const legacyKey = localStorage.getItem(storageKey);
    if (legacyKey) {
      sessionStorage.setItem(storageKey, legacyKey);
      // Clear the old localStorage key for security
      localStorage.removeItem(storageKey);
      return legacyKey;
    }
    
    return '';
  });

  // Sync to sessionStorage when key changes
  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem(storageKey, apiKey);
    } else {
      sessionStorage.removeItem(storageKey);
    }
  }, [apiKey, storageKey]);

  // Clear key function (useful for logout)
  const clearKey = useCallback(() => {
    setApiKeyState('');
    sessionStorage.removeItem(storageKey);
  }, [storageKey]);

  // Set key with validation
  const setApiKey = useCallback((newKey: string) => {
    // Basic sanitization - remove any whitespace
    const sanitizedKey = newKey.trim();
    setApiKeyState(sanitizedKey);
  }, []);

  return {
    apiKey,
    setApiKey,
    clearKey,
    hasKey: !!apiKey
  };
}

/**
 * Clear all stored API keys - useful for logout
 */
export function clearAllApiKeys() {
  const keyPatterns = [
    'master_voice_api_key',
    'master_novel_api_key',
    'master_story_api_key',
    'master_translate_api_key',
    'master_creator_api_key',
    'transformative_api_key'
  ];
  
  keyPatterns.forEach(key => {
    sessionStorage.removeItem(key);
    // Also clean up any legacy localStorage keys
    localStorage.removeItem(key);
  });
}
