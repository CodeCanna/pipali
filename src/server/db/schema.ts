import { serial, text, timestamp, pgTable, pgEnum, uuid, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { type ATIFTrajectory } from '../processor/conversation/atif/atif.types';
import { type TriggerConfig, type TriggerEventData } from '../automation/types';
import { type ConfirmationRequest } from '../processor/confirmation/confirmation.types';

export interface Context {
    compiled: string;
    file: string;
    uri?: string;
    query?: string;
}

export interface CodeContextFile {
    filename: string;
    b64_data: string;
}

export interface CodeContextResult {
    success: boolean;
    output_files: CodeContextFile[];
    std_out?: string;
    std_err: string;
    code_runtime?: number;
}

export interface CodeContextData {
    code: string;
    results?: CodeContextResult;
}

export interface WebPage {
    link: string;
    query?: string;
    snippet: string;
}

export interface AnswerBox {
    link?: string;
    snippet?: string;
    title: string;
    snippetHighlighted?: string[];
}

export interface PeopleAlsoAsk {
    link?: string;
    question?: string;
    snippet?: string;
    title?: string;
}

export interface KnowledgeGraph {
    attributes?: Record<string, string>;
    description?: string;
    descriptionLink?: string;
    descriptionSource?: string;
    imageUrl?: string;
    title: string;
    type?: string;
}

export interface OrganicContext {
    snippet?: string;
    title: string;
    link: string;
}

export interface OnlineContext {
    webpages?: WebPage | WebPage[];
    answerBox?: AnswerBox;
    peopleAlsoAsk?: PeopleAlsoAsk[];
    knowledgeGraph?: KnowledgeGraph;
    organic?: OrganicContext[];
}

export type ChatModelWithApi = {
    chatModel: typeof ChatModel.$inferSelect;
    aiModelApi: typeof AiModelApi.$inferSelect | null;
};

// Base model with timestamps
const dbBaseModel = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
};

// User Schemas
export const User = pgTable('user', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid').defaultRandom().notNull().unique(),
  password: text('password'),
  username: text('username').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email'),
  phoneNumber: text('phone_number'),
  verifiedPhoneNumber: boolean('verified_phone_number').default(false).notNull(),
  verifiedEmail: boolean('verified_email').default(false).notNull(),
  accountVerificationCode: text('account_verification_code'),
  accountVerificationCodeExpiry: timestamp('account_verification_code_expiry'),
  lastLogin: timestamp('last_login'),
  ...dbBaseModel,
});

export const GoogleUser = pgTable('google_user', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => User.id, { onDelete: 'cascade' }),
    sub: text('sub').notNull(),
    azp: text('azp').notNull(),
    email: text('email').notNull(),
    name: text('name'),
    givenName: text('given_name'),
    familyName: text('family_name'),
    picture: text('picture'),
    locale: text('locale'),
});

export const ApiKey = pgTable('api_key', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => User.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    name: text('name').notNull(),
    accessedAt: timestamp('accessed_at'),
});

export const SubscriptionTypeEnum = pgEnum('subscription_type', ['free', 'premium']);

export const Subscription = pgTable('subscription', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => User.id, { onDelete: 'cascade' }),
    type: SubscriptionTypeEnum('type').default('free').notNull(),
    isRecurring: boolean('is_recurring').default(false).notNull(),
    renewalDate: timestamp('renewal_date'),
    enabledTrialAt: timestamp('enabled_trial_at'),
});

// AI Model Schemas
export const AiModelApi = pgTable('ai_model_api', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    apiKey: text('api_key').notNull(),
    apiBaseUrl: text('api_base_url'),
    ...dbBaseModel,
});

export const ChatModelTypeEnum = pgEnum('chat_model_type', ['openai', 'anthropic', 'google']);

export const ChatModel = pgTable('chat_model', {
    id: serial('id').primaryKey(),
    maxPromptSize: integer('max_prompt_size'),
    tokenizer: text('tokenizer'),
    name: text('name').default('gemini-2.5-flash').notNull(),
    friendlyName: text('friendly_name'),
    modelType: ChatModelTypeEnum('model_type').default('google').notNull(),
    visionEnabled: boolean('vision_enabled').default(false).notNull(),
    aiModelApiId: integer('ai_model_api_id').references(() => AiModelApi.id, { onDelete: 'cascade' }),
    ...dbBaseModel,
});

export const UserChatModel = pgTable('user_chat_model', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => User.id, { onDelete: 'cascade' }),
    modelId: integer('model_id').references(() => ChatModel.id, { onDelete: 'cascade' }),
    ...dbBaseModel,
});

// Agent Schemas
export const styleColorEnum = pgEnum('style_color', ['blue', 'green', 'red', 'yellow', 'orange', 'purple', 'pink', 'teal', 'cyan', 'lime', 'indigo', 'fuchsia', 'rose', 'sky', 'amber', 'emerald']);
export const styleIconEnum = pgEnum('style_icon', ['Lightbulb', 'Health', 'Robot', 'Aperture', 'GraduationCap', 'Jeep', 'Island', 'MathOperations', 'Asclepius', 'Couch', 'Code', 'Atom', 'ClockCounterClockwise', 'PencilLine', 'Chalkboard', 'Cigarette', 'CraneTower', 'Heart', 'Leaf', 'NewspaperClipping', 'OrangeSlice', 'SmileyMelting', 'YinYang', 'SneakerMove', 'Student', 'Oven', 'Gavel', 'Broadcast']);
export const privacyLevelEnum = pgEnum('privacy_level', ['public', 'private', 'protected']);
export const inputToolEnum = pgEnum('input_tool', ['general', 'online', 'notes', 'webpage', 'code']);
export const outputModeEnum = pgEnum('output_mode', ['image', 'diagram']);

export const agents = pgTable('agents', {
    id: serial('id').primaryKey(),
    creatorId: integer('creator_id').references(() => User.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    personality: text('personality'),
    inputTools: inputToolEnum('input_tools').array(),
    outputModes: outputModeEnum('output_modes').array(),
    managedByAdmin: boolean('managed_by_admin').default(false).notNull(),
    chatModelId: integer('chat_model_id').notNull().references(() => ChatModel.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    styleColor: styleColorEnum('style_color').default('orange').notNull(),
    styleIcon: styleIconEnum('style_icon').default('Lightbulb').notNull(),
    privacyLevel: privacyLevelEnum('privacy_level').default('private').notNull(),
    isHidden: boolean('is_hidden').default(false).notNull(),
    ...dbBaseModel,
});

// Conversation Schema
export const Conversation = pgTable('conversation', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    userId: integer('user_id').notNull().references(() => User.id, { onDelete: 'cascade' }),
    trajectory: jsonb('trajectory').$type<ATIFTrajectory>().notNull(),
    title: text('title'),
    ...dbBaseModel,
});

// Web Scraper Configuration Schema
export const WebScraperTypeEnum = pgEnum('web_scraper_type', ['exa', 'direct']);

export const WebScraper = pgTable('web_scraper', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    type: WebScraperTypeEnum('type').notNull(),
    apiKey: text('api_key'),
    apiBaseUrl: text('api_base_url'),
    priority: integer('priority').default(0).notNull(),  // Higher priority = tried first
    enabled: boolean('enabled').default(true).notNull(),
    ...dbBaseModel,
});

// Automation System Schemas
export const TriggerTypeEnum = pgEnum('trigger_type', ['cron', 'file_watch']);
export const AutomationStatusEnum = pgEnum('automation_status', ['active', 'paused', 'disabled']);
export const ExecutionStatusEnum = pgEnum('execution_status', ['pending', 'running', 'awaiting_confirmation', 'completed', 'failed', 'cancelled']);
export const ConfirmationStatusEnum = pgEnum('confirmation_status', ['pending', 'approved', 'denied', 'expired']);

export const Automation = pgTable('automation', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    userId: integer('user_id').notNull().references(() => User.id, { onDelete: 'cascade' }),

    // Metadata
    name: text('name').notNull(),
    description: text('description'),
    prompt: text('prompt').notNull(),

    // Trigger configuration
    triggerType: TriggerTypeEnum('trigger_type').notNull(),
    triggerConfig: jsonb('trigger_config').$type<TriggerConfig>().notNull(),

    // Status
    status: AutomationStatusEnum('status').default('active').notNull(),

    // Execution limits
    maxIterations: integer('max_iterations').default(15).notNull(),
    maxExecutionsPerDay: integer('max_executions_per_day'),
    maxExecutionsPerHour: integer('max_executions_per_hour'),

    // Timestamps
    lastExecutedAt: timestamp('last_executed_at'),
    nextScheduledAt: timestamp('next_scheduled_at'),
    ...dbBaseModel,
});

export const AutomationExecution = pgTable('automation_execution', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    automationId: uuid('automation_id').notNull().references(() => Automation.id, { onDelete: 'cascade' }),

    // Execution details
    status: ExecutionStatusEnum('status').default('pending').notNull(),
    triggerData: jsonb('trigger_data').$type<TriggerEventData>(),

    // Results (uses ATIF format like Conversation)
    trajectory: jsonb('trajectory').$type<ATIFTrajectory>(),

    // Timing
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // Error handling
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0).notNull(),

    ...dbBaseModel,
});

export const PendingConfirmation = pgTable('pending_confirmation', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    executionId: uuid('execution_id').notNull().references(() => AutomationExecution.id, { onDelete: 'cascade' }),

    // Confirmation request details
    request: jsonb('request').$type<ConfirmationRequest>().notNull(),

    // Status tracking
    status: ConfirmationStatusEnum('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    respondedAt: timestamp('responded_at'),

    ...dbBaseModel,
});