export const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl+';
export const ALT_KEY = IS_MAC ? '⌥' : 'Alt+';
