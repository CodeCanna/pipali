/**
 * Skills Page Object
 *
 * Handles skills page interactions including viewing, creating, editing, and deleting skills.
 */

import type { Page, Locator } from '@playwright/test';
import { Selectors } from '../selectors';

export class SkillsPage {
    readonly page: Page;

    // Main page elements
    readonly skillsGallery: Locator;
    readonly skillsHeader: Locator;
    readonly skillsCount: Locator;
    readonly createBtn: Locator;
    readonly reloadBtn: Locator;
    readonly skillsCards: Locator;
    readonly skillCards: Locator;
    readonly skillsEmpty: Locator;
    readonly skillsErrors: Locator;
    readonly skillsLoading: Locator;

    // Skill detail modal elements
    readonly detailModal: Locator;
    readonly detailDescriptionInput: Locator;
    readonly detailInstructionsInput: Locator;
    readonly detailLocation: Locator;
    readonly detailLoading: Locator;
    readonly deleteConfirmText: Locator;

    // Create skill modal elements
    readonly createModal: Locator;
    readonly skillNameInput: Locator;
    readonly createDescriptionInput: Locator;
    readonly createInstructionsInput: Locator;
    readonly sourceOptions: Locator;

    // Modal common elements
    readonly modalBackdrop: Locator;
    readonly modalClose: Locator;
    readonly btnPrimary: Locator;
    readonly btnSecondary: Locator;
    readonly btnDanger: Locator;
    readonly btnDangerOutline: Locator;
    readonly formError: Locator;

    constructor(page: Page) {
        this.page = page;

        // Main page
        this.skillsGallery = page.locator(Selectors.skillsGallery);
        this.skillsHeader = page.locator(Selectors.skillsHeader);
        this.skillsCount = page.locator(Selectors.skillsCount);
        this.createBtn = page.locator(Selectors.skillsCreateBtn);
        this.reloadBtn = page.locator(Selectors.skillsReloadBtn);
        this.skillsCards = page.locator(Selectors.skillsCards);
        this.skillCards = page.locator(Selectors.skillCard);
        this.skillsEmpty = page.locator(Selectors.skillsEmpty);
        this.skillsErrors = page.locator(Selectors.skillsErrors);
        this.skillsLoading = page.locator(Selectors.skillsLoading);

        // Detail modal
        this.detailModal = page.locator(Selectors.skillDetailModal);
        this.detailDescriptionInput = page.locator(Selectors.skillDetailDescriptionInput);
        this.detailInstructionsInput = page.locator(Selectors.skillDetailInstructionsInput);
        this.detailLocation = page.locator(Selectors.skillDetailLocation);
        this.detailLoading = page.locator(Selectors.skillDetailLoading);
        this.deleteConfirmText = page.locator(Selectors.deleteConfirmText);

        // Create modal
        this.createModal = page.locator(Selectors.skillModal);
        this.skillNameInput = page.locator(Selectors.skillNameInput);
        this.createDescriptionInput = page.locator(Selectors.createSkillDescriptionInput);
        this.createInstructionsInput = page.locator(Selectors.createSkillInstructionsInput);
        this.sourceOptions = page.locator(Selectors.sourceOptions);

        // Modal common
        this.modalBackdrop = page.locator(Selectors.modalBackdrop);
        this.modalClose = page.locator(Selectors.modalClose);
        this.btnPrimary = page.locator(Selectors.btnPrimary);
        this.btnSecondary = page.locator(Selectors.btnSecondary);
        this.btnDanger = page.locator(Selectors.btnDanger);
        this.btnDangerOutline = page.locator(Selectors.btnDangerOutline);
        this.formError = page.locator(Selectors.formError);
    }

    /**
     * Navigate to the skills page
     */
    async goto(): Promise<void> {
        await this.page.goto('/skills');
        await this.waitForLoad();
    }

    /**
     * Wait for skills page to load
     */
    async waitForLoad(): Promise<void> {
        await this.skillsGallery.waitFor({ state: 'visible', timeout: 10000 });
        // Wait for loading state to disappear
        await this.page.waitForFunction(
            (loadingSelector: string) => {
                return !document.querySelector(loadingSelector);
            },
            Selectors.skillsLoading,
            { timeout: 10000 }
        );
    }

    /**
     * Get the count of skills displayed
     */
    async getSkillCount(): Promise<number> {
        const countText = await this.skillsCount.textContent();
        return parseInt(countText || '0', 10);
    }

    /**
     * Get all skill cards count
     */
    async getSkillCardsCount(): Promise<number> {
        return await this.skillCards.count();
    }

    /**
     * Check if empty state is shown
     */
    async isEmptyStateVisible(): Promise<boolean> {
        return await this.skillsEmpty.isVisible();
    }

    /**
     * Get skill card by name
     */
    getSkillCardByName(name: string): Locator {
        return this.page.locator(`${Selectors.skillCard}:has(${Selectors.skillCardTitle}:text-is("${name}"))`);
    }

    /**
     * Get skill card by source (global or local)
     */
    getSkillCardsBySource(source: 'global' | 'local'): Locator {
        return this.page.locator(`${Selectors.skillCard}:has(${Selectors.skillSourceBadge}:text-is("${source}"))`);
    }

    /**
     * Open skill detail modal by clicking on a skill card
     */
    async openSkillDetail(skillName: string): Promise<void> {
        const skillCard = this.getSkillCardByName(skillName);
        await skillCard.click();
        await this.detailModal.waitFor({ state: 'visible', timeout: 5000 });
        // Wait for instructions to load
        await this.page.waitForFunction(
            (loadingSelector: string) => {
                return !document.querySelector(loadingSelector);
            },
            Selectors.skillDetailLoading,
            { timeout: 10000 }
        );
    }

    /**
     * Close the currently open modal
     */
    async closeModal(): Promise<void> {
        await this.modalClose.click();
        await this.modalBackdrop.waitFor({ state: 'hidden', timeout: 5000 });
    }

    /**
     * Close modal by pressing Escape
     */
    async closeModalWithEscape(): Promise<void> {
        await this.page.keyboard.press('Escape');
        await this.modalBackdrop.waitFor({ state: 'hidden', timeout: 5000 });
    }

    /**
     * Get skill detail modal title (skill name)
     */
    async getDetailModalTitle(): Promise<string> {
        const header = this.detailModal.locator('h2');
        return (await header.textContent()) || '';
    }

    /**
     * Get skill description from detail modal
     */
    async getDetailDescription(): Promise<string> {
        return await this.detailDescriptionInput.inputValue();
    }

    /**
     * Get skill instructions from detail modal
     */
    async getDetailInstructions(): Promise<string> {
        return await this.detailInstructionsInput.inputValue();
    }

    /**
     * Get skill location from detail modal
     */
    async getDetailLocationText(): Promise<string> {
        return (await this.detailLocation.textContent()) || '';
    }

    /**
     * Edit skill description in detail modal
     */
    async editDescription(newDescription: string): Promise<void> {
        await this.detailDescriptionInput.clear();
        await this.detailDescriptionInput.fill(newDescription);
    }

    /**
     * Edit skill instructions in detail modal
     */
    async editInstructions(newInstructions: string): Promise<void> {
        await this.detailInstructionsInput.clear();
        await this.detailInstructionsInput.fill(newInstructions);
    }

    /**
     * Save skill changes
     */
    async saveSkill(): Promise<void> {
        const saveBtn = this.detailModal.locator(Selectors.btnPrimary);
        await saveBtn.click();
        // Wait for modal to close after successful save
        await this.detailModal.waitFor({ state: 'hidden', timeout: 5000 });
    }

    /**
     * Check if save button is enabled
     */
    async isSaveButtonEnabled(): Promise<boolean> {
        const saveBtn = this.detailModal.locator(Selectors.btnPrimary);
        return await saveBtn.isEnabled();
    }

    /**
     * Click delete button in detail modal
     */
    async clickDeleteButton(): Promise<void> {
        await this.btnDangerOutline.click();
    }

    /**
     * Confirm skill deletion
     */
    async confirmDelete(): Promise<void> {
        // Wait for delete confirmation to appear
        await this.deleteConfirmText.waitFor({ state: 'visible', timeout: 3000 });
        // Click confirm delete (danger button in the actions)
        await this.btnDanger.click();
        // Wait for modal to close after deletion
        await this.detailModal.waitFor({ state: 'hidden', timeout: 5000 });
    }

    /**
     * Cancel skill deletion
     */
    async cancelDelete(): Promise<void> {
        await this.deleteConfirmText.waitFor({ state: 'visible', timeout: 3000 });
        await this.btnSecondary.click();
        // Delete confirmation should disappear
        await this.deleteConfirmText.waitFor({ state: 'hidden', timeout: 3000 });
    }

    /**
     * Open create skill modal
     */
    async openCreateModal(): Promise<void> {
        await this.createBtn.click();
        await this.createModal.waitFor({ state: 'visible', timeout: 5000 });
    }

    /**
     * Fill create skill form
     */
    async fillCreateForm(options: {
        name: string;
        description: string;
        instructions?: string;
        source?: 'global' | 'local';
    }): Promise<void> {
        await this.skillNameInput.fill(options.name);
        await this.createDescriptionInput.fill(options.description);

        if (options.instructions) {
            await this.createInstructionsInput.fill(options.instructions);
        }

        if (options.source) {
            const sourceBtn = this.page.locator(`.source-option:has-text("${options.source === 'global' ? 'Global' : 'Local'}")`);
            await sourceBtn.click();
        }
    }

    /**
     * Submit create skill form
     */
    async submitCreateForm(): Promise<void> {
        const submitBtn = this.createModal.locator('button[type="submit"]');
        await submitBtn.click();
        // Wait for modal to close after successful creation
        await this.createModal.waitFor({ state: 'hidden', timeout: 5000 });
    }

    /**
     * Reload skills from disk
     */
    async reloadSkills(): Promise<void> {
        await this.reloadBtn.click();
        // Wait for reload to complete (spinner should appear and disappear)
        await this.page.waitForTimeout(500); // Brief wait for spinner to appear
        await this.page.waitForFunction(
            (selector: string) => {
                const btn = document.querySelector(selector);
                if (!btn) return true;
                const spinner = btn.querySelector('.spinning');
                return !spinner;
            },
            Selectors.skillsReloadBtn,
            { timeout: 10000 }
        );
    }

    /**
     * Get all skill names displayed on the page
     */
    async getAllSkillNames(): Promise<string[]> {
        const names: string[] = [];
        const count = await this.skillCards.count();

        for (let i = 0; i < count; i++) {
            const titleElement = this.skillCards.nth(i).locator(Selectors.skillCardTitle);
            const name = await titleElement.textContent();
            if (name) {
                names.push(name);
            }
        }

        return names;
    }

    /**
     * Get all skills with their sources
     */
    async getAllSkillsWithSource(): Promise<{ name: string; source: string }[]> {
        const skills: { name: string; source: string }[] = [];
        const count = await this.skillCards.count();

        for (let i = 0; i < count; i++) {
            const card = this.skillCards.nth(i);
            const name = await card.locator(Selectors.skillCardTitle).textContent();
            const source = await card.locator(Selectors.skillSourceBadge).textContent();
            if (name && source) {
                skills.push({ name, source });
            }
        }

        return skills;
    }

    /**
     * Check if form has validation error
     */
    async hasFormError(): Promise<boolean> {
        return await this.formError.isVisible();
    }

    /**
     * Get form error message
     */
    async getFormErrorMessage(): Promise<string> {
        return (await this.formError.textContent()) || '';
    }

    /**
     * Check if skills load errors are displayed
     */
    async hasLoadErrors(): Promise<boolean> {
        return await this.skillsErrors.isVisible();
    }

    /**
     * Get load error count
     */
    async getLoadErrorCount(): Promise<number> {
        const errorItems = this.page.locator(Selectors.skillsError);
        return await errorItems.count();
    }
}
