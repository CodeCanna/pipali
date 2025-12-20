import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { parseFrontmatter, isValidSkillName, loadSkillsFromPaths } from '../../src/server/skills/loader';
import { formatSkillsForPrompt } from '../../src/server/skills/prompt';
import type { Skill } from '../../src/server/skills/types';

describe('skills', () => {
    const testDir = path.join(os.tmpdir(), 'skills-tests');

    beforeAll(async () => {
        await fs.mkdir(testDir, { recursive: true });
    });

    afterAll(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('parseFrontmatter', () => {
        test('should parse valid frontmatter with unquoted values', () => {
            const content = `---
name: my-skill
description: A test skill for testing
---
# My Skill
This is the skill content.
`;
            const result = parseFrontmatter(content);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('my-skill');
            expect(result?.description).toBe('A test skill for testing');
        });

        test('should parse frontmatter with quoted values', () => {
            const content = `---
name: "quoted-skill"
description: 'A quoted description'
---
Content here.
`;
            const result = parseFrontmatter(content);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('quoted-skill');
            expect(result?.description).toBe('A quoted description');
        });

        test('should parse description with inner apostrophe in double quotes', () => {
            const content = `---
name: accounts-skill
description: "The user's accounts manager"
---
Content here.
`;
            const result = parseFrontmatter(content);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('accounts-skill');
            expect(result?.description).toBe("The user's accounts manager");
        });

        test('should parse description with inner double quote in single quotes', () => {
            const content = `---
name: quote-skill
description: 'A "quoted" word inside'
---
Content here.
`;
            const result = parseFrontmatter(content);
            expect(result).not.toBeNull();
            expect(result?.description).toBe('A "quoted" word inside');
        });

        test('should return null for missing frontmatter', () => {
            const content = `# No Frontmatter
Just some content.
`;
            const result = parseFrontmatter(content);
            expect(result).toBeNull();
        });

        test('should handle frontmatter with only name', () => {
            const content = `---
name: only-name
---
Content.
`;
            const result = parseFrontmatter(content);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('only-name');
            expect(result?.description).toBeUndefined();
        });
    });

    describe('isValidSkillName', () => {
        test('should accept valid names', () => {
            expect(isValidSkillName('a')).toBe(true);
            expect(isValidSkillName('skill')).toBe(true);
            expect(isValidSkillName('my-skill')).toBe(true);
            expect(isValidSkillName('skill123')).toBe(true);
            expect(isValidSkillName('my-cool-skill-2')).toBe(true);
        });

        test('should reject empty names', () => {
            expect(isValidSkillName('')).toBe(false);
        });

        test('should reject names with uppercase', () => {
            expect(isValidSkillName('MySkill')).toBe(false);
            expect(isValidSkillName('SKILL')).toBe(false);
        });

        test('should reject names starting with hyphen', () => {
            expect(isValidSkillName('-skill')).toBe(false);
        });

        test('should reject names ending with hyphen', () => {
            expect(isValidSkillName('skill-')).toBe(false);
        });

        test('should reject names with consecutive hyphens', () => {
            expect(isValidSkillName('my--skill')).toBe(false);
        });

        test('should reject names over 64 characters', () => {
            const longName = 'a'.repeat(65);
            expect(isValidSkillName(longName)).toBe(false);
        });

        test('should reject names with special characters', () => {
            expect(isValidSkillName('my_skill')).toBe(false);
            expect(isValidSkillName('my.skill')).toBe(false);
            expect(isValidSkillName('my skill')).toBe(false);
        });
    });

    describe('loadSkillsFromPaths', () => {
        const globalDir = path.join(testDir, 'global-skills');
        const localDir = path.join(testDir, 'local-skills');

        beforeAll(async () => {
            await fs.mkdir(globalDir, { recursive: true });
            await fs.mkdir(localDir, { recursive: true });
        });

        test('should load valid skill', async () => {
            const skillDir = path.join(globalDir, 'valid-skill');
            await fs.mkdir(skillDir, { recursive: true });
            await fs.writeFile(
                path.join(skillDir, 'SKILL.md'),
                `---
name: valid-skill
description: A valid test skill
---
# Valid Skill
This is a test skill.
`
            );

            const result = await loadSkillsFromPaths([{ path: globalDir, source: 'global' }]);

            expect(result.skills.length).toBe(1);
            expect(result.skills[0]?.name).toBe('valid-skill');
            expect(result.skills[0]?.description).toBe('A valid test skill');
            expect(result.skills[0]?.source).toBe('global');
            expect(result.errors.length).toBe(0);
        });

        test('should skip skill with missing name', async () => {
            const skillDir = path.join(globalDir, 'no-name');
            await fs.mkdir(skillDir, { recursive: true });
            await fs.writeFile(
                path.join(skillDir, 'SKILL.md'),
                `---
description: Missing name field
---
Content.
`
            );

            const result = await loadSkillsFromPaths([{ path: globalDir, source: 'global' }]);

            const error = result.errors.find(e => e.path.includes('no-name'));
            expect(error).toBeDefined();
            expect(error?.message).toContain('Missing required field: name');
        });

        test('should skip skill with invalid name format', async () => {
            const skillDir = path.join(globalDir, 'InvalidName');
            await fs.mkdir(skillDir, { recursive: true });
            await fs.writeFile(
                path.join(skillDir, 'SKILL.md'),
                `---
name: InvalidName
description: Has invalid name
---
Content.
`
            );

            const result = await loadSkillsFromPaths([{ path: globalDir, source: 'global' }]);

            const error = result.errors.find(e => e.path.includes('InvalidName'));
            expect(error).toBeDefined();
            expect(error?.message).toContain('Invalid skill name');
        });

        test('should skip skill when name does not match directory', async () => {
            const skillDir = path.join(globalDir, 'dir-name');
            await fs.mkdir(skillDir, { recursive: true });
            await fs.writeFile(
                path.join(skillDir, 'SKILL.md'),
                `---
name: different-name
description: Name does not match directory
---
Content.
`
            );

            const result = await loadSkillsFromPaths([{ path: globalDir, source: 'global' }]);

            const error = result.errors.find(e => e.path.includes('dir-name'));
            expect(error).toBeDefined();
            expect(error?.message).toContain('does not match directory name');
        });

        test('should handle non-existent directory gracefully', async () => {
            const result = await loadSkillsFromPaths([
                { path: '/nonexistent/path/skills', source: 'global' }
            ]);

            expect(result.skills.length).toBe(0);
            expect(result.errors.length).toBe(0); // Non-existent dir is silently skipped
        });

        test('should let local skills override global skills', async () => {
            // Create global skill
            const globalSkillDir = path.join(globalDir, 'override-test');
            await fs.mkdir(globalSkillDir, { recursive: true });
            await fs.writeFile(
                path.join(globalSkillDir, 'SKILL.md'),
                `---
name: override-test
description: Global version
---
Global content.
`
            );

            // Create local skill with same name
            const localSkillDir = path.join(localDir, 'override-test');
            await fs.mkdir(localSkillDir, { recursive: true });
            await fs.writeFile(
                path.join(localSkillDir, 'SKILL.md'),
                `---
name: override-test
description: Local version
---
Local content.
`
            );

            const result = await loadSkillsFromPaths([
                { path: globalDir, source: 'global' },
                { path: localDir, source: 'local' },
            ]);

            const skill = result.skills.find(s => s.name === 'override-test');
            expect(skill).toBeDefined();
            expect(skill?.description).toBe('Local version');
            expect(skill?.source).toBe('local');
        });

        test('should load skill with apostrophe in description', async () => {
            const skillDir = path.join(localDir, 'apostrophe-skill');
            await fs.mkdir(skillDir, { recursive: true });
            await fs.writeFile(
                path.join(skillDir, 'SKILL.md'),
                `---
name: apostrophe-skill
description: "Manage the user's personal accounts"
---
# Apostrophe Skill
`
            );

            const result = await loadSkillsFromPaths([{ path: localDir, source: 'local' }]);

            const skill = result.skills.find(s => s.name === 'apostrophe-skill');
            expect(skill).toBeDefined();
            expect(skill?.description).toBe("Manage the user's personal accounts");
        });

        test('should load skill with double quotes in description', async () => {
            const skillDir = path.join(localDir, 'quotes-skill');
            await fs.mkdir(skillDir, { recursive: true });
            await fs.writeFile(
                path.join(skillDir, 'SKILL.md'),
                `---
name: quotes-skill
description: 'Run the "special" command'
---
# Quotes Skill
`
            );

            const result = await loadSkillsFromPaths([{ path: localDir, source: 'local' }]);

            const skill = result.skills.find(s => s.name === 'quotes-skill');
            expect(skill).toBeDefined();
            expect(skill?.description).toBe('Run the "special" command');
        });

        test('should load skill with unquoted description', async () => {
            const skillDir = path.join(localDir, 'unquoted-skill');
            await fs.mkdir(skillDir, { recursive: true });
            await fs.writeFile(
                path.join(skillDir, 'SKILL.md'),
                `---
name: unquoted-skill
description: A simple unquoted description
---
# Unquoted Skill
`
            );

            const result = await loadSkillsFromPaths([{ path: localDir, source: 'local' }]);

            const skill = result.skills.find(s => s.name === 'unquoted-skill');
            expect(skill).toBeDefined();
            expect(skill?.description).toBe('A simple unquoted description');
        });
    });

    describe('formatSkillsForPrompt', () => {
        test('should return empty string for no skills', () => {
            const result = formatSkillsForPrompt([]);
            expect(result).toBe('');
        });

        test('should format single skill as XML', () => {
            const skills: Skill[] = [
                {
                    name: 'test-skill',
                    description: 'A test skill',
                    location: '/path/to/test-skill/SKILL.md',
                    source: 'global',
                },
            ];

            const result = formatSkillsForPrompt(skills);

            expect(result).toContain('<available_skills>');
            expect(result).toContain('</available_skills>');
            expect(result).toContain('<skill>');
            expect(result).toContain('<name>test-skill</name>');
            expect(result).toContain('<description>A test skill</description>');
            expect(result).toContain('<location>/path/to/test-skill/SKILL.md</location>');
        });

        test('should escape XML special characters', () => {
            const skills: Skill[] = [
                {
                    name: 'xml-skill',
                    description: 'Uses <tags> & "quotes"',
                    location: '/path/to/skill',
                    source: 'local',
                },
            ];

            const result = formatSkillsForPrompt(skills);

            expect(result).toContain('&lt;tags&gt;');
            expect(result).toContain('&amp;');
            expect(result).toContain('&quot;quotes&quot;');
        });

        test('should format multiple skills', () => {
            const skills: Skill[] = [
                { name: 'skill-1', description: 'First skill', location: '/path/1', source: 'global' },
                { name: 'skill-2', description: 'Second skill', location: '/path/2', source: 'local' },
            ];

            const result = formatSkillsForPrompt(skills);

            expect(result).toContain('<name>skill-1</name>');
            expect(result).toContain('<name>skill-2</name>');
        });
    });
});
