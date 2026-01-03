/**
 * Display Settings Store
 * 显示设置状态管理
 * 
 * Manages user preferences for chat display:
 * - fontSize: small/medium/large
 * - compactMode: boolean
 * - showTimestamps: boolean
 * 
 * Persisted to localStorage
 * 
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 12.1, 12.2, 12.3**
 */

// Safely access Valtio (may not be available in test environment)
const getValtio = () => {
  if (typeof window !== "undefined" && (window as any).Valtio) {
    return (window as any).Valtio as {
      proxy: <T extends object>(obj: T) => T;
      subscribe: <T extends object>(proxyObject: T, callback: () => void) => () => void;
    };
  }
  // Fallback for test environment - simple object without reactivity
  return {
    proxy: <T extends object>(obj: T) => obj,
    subscribe: <T extends object>(_proxyObject: T, _callback: () => void) => () => {},
  };
};

const { proxy, subscribe } = getValtio();

// ============================================================================
// Types
// ============================================================================

export type FontSize = "small" | "medium" | "large";

export interface DisplaySettings {
  fontSize: FontSize;
  compactMode: boolean;
  showTimestamps: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DISPLAY_SETTINGS_KEY = "ai-chat-display-settings";

const DEFAULT_SETTINGS: DisplaySettings = {
  fontSize: "medium",
  compactMode: false,
  showTimestamps: true,
};

// Font size mapping (in pixels)
export const fontSizeMap: Record<FontSize, string> = {
  small: "13px",
  medium: "15px",
  large: "17px",
};

// Spacing configuration for compact/comfortable modes
export const spacingConfig = {
  compact: {
    messageGap: 6,
    messagePadding: "8px 12px",
    bubblePadding: "10px 14px",
  },
  comfortable: {
    messageGap: 12,
    messagePadding: "12px 16px",
    bubblePadding: "14px 18px",
  },
};

// ============================================================================
// Store
// ============================================================================

/**
 * Load settings from localStorage
 */
function loadSettings(): DisplaySettings {
  // Check if localStorage is available (not in test environment)
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const stored = localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate and merge with defaults
      return {
        fontSize: ["small", "medium", "large"].includes(parsed.fontSize) 
          ? parsed.fontSize 
          : DEFAULT_SETTINGS.fontSize,
        compactMode: typeof parsed.compactMode === "boolean" 
          ? parsed.compactMode 
          : DEFAULT_SETTINGS.compactMode,
        showTimestamps: typeof parsed.showTimestamps === "boolean" 
          ? parsed.showTimestamps 
          : DEFAULT_SETTINGS.showTimestamps,
      };
    }
  } catch (e) {
    console.warn("[DisplaySettings] Failed to load settings:", e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: DisplaySettings): void {
  // Check if localStorage is available (not in test environment)
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[DisplaySettings] Failed to save settings:", e);
  }
}

// Create reactive store with initial values from localStorage
export const displaySettingsStore = proxy<DisplaySettings>(loadSettings());

// Auto-save to localStorage when store changes
subscribe(displaySettingsStore, () => {
  saveSettings({
    fontSize: displaySettingsStore.fontSize,
    compactMode: displaySettingsStore.compactMode,
    showTimestamps: displaySettingsStore.showTimestamps,
  });
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Set font size
 */
export function setFontSize(size: FontSize): void {
  displaySettingsStore.fontSize = size;
}

/**
 * Set compact mode
 */
export function setCompactMode(enabled: boolean): void {
  displaySettingsStore.compactMode = enabled;
}

/**
 * Set timestamp visibility
 */
export function setShowTimestamps(show: boolean): void {
  displaySettingsStore.showTimestamps = show;
}

/**
 * Reset to default settings
 */
export function resetDisplaySettings(): void {
  displaySettingsStore.fontSize = DEFAULT_SETTINGS.fontSize;
  displaySettingsStore.compactMode = DEFAULT_SETTINGS.compactMode;
  displaySettingsStore.showTimestamps = DEFAULT_SETTINGS.showTimestamps;
}

// ============================================================================
// Utility Functions (Pure functions for testing)
// ============================================================================

/**
 * Get the message gap based on compact mode
 * 
 * **Feature: chat-ui-enhancement, Property 10: Compact mode spacing reduction**
 * **Validates: Requirements 12.2**
 */
export function getMessageGap(compactMode: boolean): number {
  return compactMode ? spacingConfig.compact.messageGap : spacingConfig.comfortable.messageGap;
}

/**
 * Get the message padding based on compact mode
 * 
 * **Feature: chat-ui-enhancement, Property 10: Compact mode spacing reduction**
 * **Validates: Requirements 12.2**
 */
export function getMessagePadding(compactMode: boolean): string {
  return compactMode ? spacingConfig.compact.messagePadding : spacingConfig.comfortable.messagePadding;
}

/**
 * Get the bubble padding based on compact mode
 * 
 * **Feature: chat-ui-enhancement, Property 10: Compact mode spacing reduction**
 * **Validates: Requirements 12.2**
 */
export function getBubblePadding(compactMode: boolean): string {
  return compactMode ? spacingConfig.compact.bubblePadding : spacingConfig.comfortable.bubblePadding;
}

/**
 * Determine if timestamps should be rendered
 * 
 * **Feature: chat-ui-enhancement, Property 11: Timestamp visibility toggle**
 * **Validates: Requirements 12.3**
 */
export function shouldRenderTimestamp(showTimestamps: boolean): boolean {
  return showTimestamps;
}

/**
 * Get font size in pixels
 */
export function getFontSizeValue(fontSize: FontSize): string {
  return fontSizeMap[fontSize];
}
