/**
 * Skills module - main entry point
 * Provides skill loading, caching, and prompt formatting
 */

import path from 'path';
import os from 'os';
import { loadSkillsFromPaths } from './loader';
import { formatSkillsForPrompt } from './prompt';
import type { Skill, SkillLoadResult } from './types';

// Cached skills after loading
let cachedSkills: Skill[] = [];

/**
 * Get the paths to scan for skills
 * Returns global path (~/.panini/skills) and local path (<cwd>/.panini/skills)
 */
function getSkillsPaths(): { path: string; source: 'global' | 'local' }[] {
    return [
        { path: path.join(os.homedir(), '.panini', 'skills'), source: 'global' },
        { path: path.join(process.cwd(), '.panini', 'skills'), source: 'local' },
    ];
}

/**
 * Load skills from global and local paths
 * Caches the result for later retrieval via getLoadedSkills()
 * Local skills override global skills with the same name
 */
export async function loadSkills(): Promise<SkillLoadResult> {
    const paths = getSkillsPaths();
    const result = await loadSkillsFromPaths(paths);
    cachedSkills = result.skills;
    return result;
}

/**
 * Get the currently loaded skills
 * Returns cached skills from the last loadSkills() call
 */
export function getLoadedSkills(): Skill[] {
    return cachedSkills;
}

// Re-export types and utilities
export { formatSkillsForPrompt };
export type { Skill, SkillLoadResult, SkillLoadError } from './types';
