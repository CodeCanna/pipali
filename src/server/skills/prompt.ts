/**
 * Skills prompt formatting - converts skills to XML format for system prompt
 */

import type { Skill } from './types';

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Format a single skill as XML
 */
function formatSkill(skill: Skill): string {
    return `  <skill>
    <name>${escapeXml(skill.name)}</name>
    <description>${escapeXml(skill.description)}</description>
    <location>${escapeXml(skill.location)}</location>
  </skill>`;
}

/**
 * Format all skills as XML for inclusion in system prompt
 * Returns empty string if no skills are available
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
    if (skills.length === 0) {
        return '';
    }

    const skillsXml = skills.map(formatSkill).join('\n');

    return `# Available Skills
The following skills are available. To use a skill, read its SKILL.md file at the location path for detailed instructions.

<available_skills>
${skillsXml}
</available_skills>`;
}
