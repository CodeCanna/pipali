/**
 * Skills module - main entry point
 * Provides skill loading, caching, and prompt formatting
 */

import path from 'path';
import os from 'os';
import { mkdir, rm, readdir, cp } from 'fs/promises';
import { loadSkillsFromPaths, isValidSkillName, isValidDescription } from './loader';
import { formatSkillsForPrompt } from './utils';
import type { Skill, SkillLoadResult } from './types';

// Path to builtin skills shipped with the app
const BUILTIN_SKILLS_DIR = path.join(import.meta.dir, 'builtin');

export interface DeleteSkillResult {
    success: boolean;
    error?: string;
}

export interface GetSkillResult {
    success: boolean;
    skill?: Skill;
    instructions?: string;
    error?: string;
}

export interface CreateSkillInput {
    name: string;
    description: string;
    instructions?: string;
    source: 'global' | 'local';
}

export interface CreateSkillResult {
    success: boolean;
    skill?: Skill;
    error?: string;
}

export interface UpdateSkillInput {
    description: string;
    instructions?: string;
}

export interface UpdateSkillResult {
    success: boolean;
    skill?: Skill;
    error?: string;
}

// Cached skills after loading
let cachedSkills: Skill[] = [];

/**
 * Get the global skills directory path
 */
export function getGlobalSkillsDir(): string {
    return process.env.PIPALI_SKILLS_GLOBAL_DIR || path.join(os.homedir(), '.pipali', 'skills');
}

/**
 * Get the local skills directory path
 */
export function getLocalSkillsDir(): string {
    return process.env.PIPALI_SKILLS_LOCAL_DIR || path.join(process.cwd(), '.pipali', 'skills');
}

/**
 * Install builtin skills to the global skills directory.
 * Only copies skills that don't already exist (won't overwrite user modifications).
 * Called on app startup/first run.
 */
export async function installBuiltinSkills(): Promise<{ installed: string[]; skipped: string[] }> {
    const installed: string[] = [];
    const skipped: string[] = [];
    const globalDir = getGlobalSkillsDir();

    // Ensure global skills directory exists
    await mkdir(globalDir, { recursive: true });

    // Read builtin skills directory
    let builtinEntries: Awaited<ReturnType<typeof readdir>>;
    try {
        builtinEntries = await readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true });
    } catch (err) {
        // No builtin skills directory or can't read it
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return { installed, skipped };
        }
        throw err;
    }

    for (const entry of builtinEntries) {
        // Skip non-directories and hidden files
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
            continue;
        }

        const skillName = entry.name;
        const srcDir = path.join(BUILTIN_SKILLS_DIR, skillName);
        const destDir = path.join(globalDir, skillName);

        // Check if skill already exists in global directory
        const destSkillMd = Bun.file(path.join(destDir, 'SKILL.md'));
        if (await destSkillMd.exists()) {
            skipped.push(skillName);
            continue;
        }

        // Copy the skill directory
        try {
            await cp(srcDir, destDir, { recursive: true });
            installed.push(skillName);
        } catch (err) {
            console.error(`Failed to install builtin skill "${skillName}":`, err);
        }
    }

    return { installed, skipped };
}

/**
 * Get the paths to scan for skills
 * Returns global path (~/.pipali/skills) and local path (<cwd>/.pipali/skills)
 * Paths can be overridden via PIPALI_SKILLS_GLOBAL_DIR and PIPALI_SKILLS_LOCAL_DIR env vars
 */
function getSkillsPaths(): { path: string; source: 'global' | 'local' }[] {
    return [
        { path: getGlobalSkillsDir(), source: 'global' },
        { path: getLocalSkillsDir(), source: 'local' },
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

/**
 * Create a new skill by writing a SKILL.md file to the appropriate location
 */
export async function createSkill(input: CreateSkillInput): Promise<CreateSkillResult> {
    const { name, description, instructions = '', source } = input;

    // Validate name
    if (!isValidSkillName(name)) {
        return {
            success: false,
            error: 'Invalid skill name: must be 1-64 lowercase alphanumeric chars and hyphens, no consecutive hyphens, cannot start/end with hyphen',
        };
    }

    // Validate description
    if (!isValidDescription(description)) {
        return {
            success: false,
            error: 'Description must be 1-1024 characters',
        };
    }

    // Determine the base path
    const basePath = source === 'global' ? getGlobalSkillsDir() : getLocalSkillsDir();

    const skillDir = path.join(basePath, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    // Check if skill already exists
    const existingFile = Bun.file(skillMdPath);
    if (await existingFile.exists()) {
        return {
            success: false,
            error: `Skill "${name}" already exists at ${skillMdPath}`,
        };
    }

    // Create directory structure
    try {
        await mkdir(skillDir, { recursive: true });
    } catch (err) {
        return {
            success: false,
            error: `Failed to create skill directory: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    // Generate SKILL.md content
    const content = `---
name: ${name}
description: ${description}
---

${instructions}
`.trim() + '\n';

    // Write the file
    try {
        await Bun.write(skillMdPath, content);
    } catch (err) {
        return {
            success: false,
            error: `Failed to write SKILL.md: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    const skill: Skill = {
        name,
        description,
        location: skillMdPath,
        source,
    };

    return {
        success: true,
        skill,
    };
}

/**
 * Get a skill by name with its full instructions
 */
export async function getSkill(name: string): Promise<GetSkillResult> {
    // Find the skill in cache
    const skill = cachedSkills.find(s => s.name === name);
    if (!skill) {
        return {
            success: false,
            error: `Skill "${name}" not found`,
        };
    }

    // Read the SKILL.md file to get instructions
    try {
        const file = Bun.file(skill.location);
        const content = await file.text();

        // Extract instructions (everything after the frontmatter)
        const frontmatterEnd = content.indexOf('---', 3);
        const instructions = frontmatterEnd !== -1
            ? content.slice(frontmatterEnd + 3).trim()
            : '';

        return {
            success: true,
            skill,
            instructions,
        };
    } catch (err) {
        return {
            success: false,
            error: `Failed to read skill: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

/**
 * Delete a skill by removing its directory
 */
export async function deleteSkill(name: string): Promise<DeleteSkillResult> {
    // Find the skill in cache
    const skill = cachedSkills.find(s => s.name === name);
    if (!skill) {
        return {
            success: false,
            error: `Skill "${name}" not found`,
        };
    }

    // Get the skill directory (parent of SKILL.md)
    const skillDir = path.dirname(skill.location);

    // Delete the directory and its contents
    try {
        await rm(skillDir, { recursive: true });
    } catch (err) {
        return {
            success: false,
            error: `Failed to delete skill: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    // Remove from cache
    cachedSkills = cachedSkills.filter(s => s.name !== name);

    return {
        success: true,
    };
}

/**
 * Update an existing skill's description and instructions
 */
export async function updateSkill(name: string, input: UpdateSkillInput): Promise<UpdateSkillResult> {
    const { description, instructions = '' } = input;

    // Find the skill in cache
    const skill = cachedSkills.find(s => s.name === name);
    if (!skill) {
        return {
            success: false,
            error: `Skill "${name}" not found`,
        };
    }

    // Validate description
    if (!isValidDescription(description)) {
        return {
            success: false,
            error: 'Description must be 1-1024 characters',
        };
    }

    // Generate updated SKILL.md content
    const content = `---
name: ${name}
description: ${description}
---

${instructions}
`.trim() + '\n';

    // Write the updated file
    try {
        await Bun.write(skill.location, content);
    } catch (err) {
        return {
            success: false,
            error: `Failed to write SKILL.md: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    // Update cache
    const updatedSkill: Skill = {
        ...skill,
        description,
    };
    cachedSkills = cachedSkills.map(s => s.name === name ? updatedSkill : s);

    return {
        success: true,
        skill: updatedSkill,
    };
}

// Re-export types and utilities
export { formatSkillsForPrompt, isValidSkillName, isValidDescription };
export type { Skill, SkillLoadResult, SkillLoadError } from './types';
