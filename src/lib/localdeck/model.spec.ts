import { describe, expect, it } from 'vitest';

import {
	applyTemplateStructureToLinkedCard,
	applyTemplateToCard,
	cardTemplateFields,
	createBlankTemplateRecord,
	createTemplateFromCard,
	customFieldInputValue,
	emptyCustomFieldValue,
	normalizeCustomFieldOrder,
	normalizeExplicitCustomFields,
	normalizeCustomFieldValue,
	parseOptionsDraft,
	removeCustomFieldValues,
	removeLabelReferences
} from './model';
import type { CardRecord, CardTemplateRecord, CustomFieldDefinition } from './types';

const timestamp = '2026-05-15T10:00:00.000Z';

describe('LocalDeck v0.2 model helpers', () => {
	it('creates the board-scoped blank template default', () => {
		expect.hasAssertions();

		const template = createBlankTemplateRecord('board-1', timestamp, 'template-1');

		expect(template).toMatchObject({
			id: 'template-1',
			boardId: 'board-1',
			name: 'Blank',
			descriptionMarkdown: '',
			labelIds: [],
			dates: [],
			customFields: {},
			customFieldOrder: [],
			createdAt: timestamp,
			updatedAt: timestamp
		});
	});

	it('applies a template while preserving card identity, name, comments, and placement', () => {
		expect.hasAssertions();

		const card = createCard();
		const template: CardTemplateRecord = {
			id: 'template-1',
			boardId: 'board-1',
			name: 'Bug',
			descriptionMarkdown: '## Steps',
			labelIds: ['label-1'],
			dates: [{ id: 'date-1', type: 'due', label: 'Due', date: '2026-06-01' }],
			customFields: { field1: 'P1' },
			customFieldOrder: ['field1'],
			createdAt: timestamp,
			updatedAt: timestamp
		};

		const next = applyTemplateToCard(card, template, '2026-05-16T10:00:00.000Z');

		expect(next).toMatchObject({
			id: card.id,
			boardId: card.boardId,
			stackId: card.stackId,
			name: card.name,
			position: card.position,
			comments: card.comments,
			templateId: template.id,
			templateState: 'linked',
			descriptionMarkdown: template.descriptionMarkdown,
			labelIds: template.labelIds,
			customFields: template.customFields,
			customFieldOrder: template.customFieldOrder,
			createdAt: card.createdAt,
			updatedAt: '2026-05-16T10:00:00.000Z'
		});
	});

	it('normalizes custom field values according to field type and options', () => {
		expect.hasAssertions();

		const selectField = createField('select', [
			{ id: 'todo', name: 'Todo' },
			{ id: 'done', name: 'Done' }
		]);
		const multiField = createField('multiselect', [
			{ id: 'web', name: 'Web' },
			{ id: 'desktop', name: 'Desktop' }
		]);

		expect(normalizeCustomFieldValue(createField('number'), '42' as never)).toBe(42);
		expect(normalizeCustomFieldValue(createField('checkbox'), 'yes' as never)).toBe(true);
		expect(normalizeCustomFieldValue(selectField, 'missing')).toBe('');
		expect(normalizeCustomFieldValue(selectField, 'todo')).toBe('todo');
		expect(normalizeCustomFieldValue(multiField, ['web', 'missing'])).toEqual(['web']);
		expect(normalizeCustomFieldValue(createField('url'), 22 as never)).toBe('');
	});

	it('keeps cleared number custom field inputs empty through normalization', () => {
		expect.hasAssertions();

		const numberField = createField('number');
		const emptyInput = customFieldInputValue(numberField, '');

		expect(emptyInput).toBeNull();
		expect(normalizeCustomFieldValue(numberField, emptyInput)).toBeNull();
		expect(normalizeCustomFieldValue(numberField, customFieldInputValue(numberField, '12'))).toBe(
			12
		);
	});

	it('deduplicates custom field option drafts while preserving first occurrence order', () => {
		expect.hasAssertions();

		const existing = createField('select', [
			{ id: 'p1', name: 'P1' },
			{ id: 'p2', name: 'P2' }
		]);
		const options = parseOptionsDraft('P1\nP1, P2\nP3\nP2', existing);

		expect(options.map((option) => option.name)).toEqual(['P1', 'P2', 'P3']);
		expect(options.map((option) => option.id)).toEqual(['p1', 'p2', expect.any(String)]);
		expect(new Set(options.map((option) => option.id)).size).toBe(options.length);
	});

	it('normalizes only explicitly selected custom fields', () => {
		expect.hasAssertions();

		const textField = createField('text');
		const numberField = createField('number');
		const fields = [textField, numberField, createField('checkbox')];

		expect(
			normalizeExplicitCustomFields(fields, {
				[textField.id]: 123 as never,
				[numberField.id]: '7' as never,
				unknown: 'ignored'
			})
		).toEqual({
			[textField.id]: '',
			[numberField.id]: 7
		});
	});

	it('copies only template custom fields when creating template-based cards', () => {
		expect.hasAssertions();

		const template: CardTemplateRecord = {
			id: 'template-1',
			boardId: 'board-1',
			name: 'Feature',
			descriptionMarkdown: 'Scope',
			labelIds: [],
			dates: [],
			customFields: { priority: 'High' },
			customFieldOrder: ['priority'],
			createdAt: timestamp,
			updatedAt: timestamp
		};

		expect(cardTemplateFields(template).customFields).toEqual({ priority: 'High' });
		expect(cardTemplateFields(template).customFieldOrder).toEqual(['priority']);
		expect(cardTemplateFields(null).customFields).toEqual({});
		expect(cardTemplateFields(null).customFieldOrder).toEqual([]);
	});

	it('normalizes custom field order while preserving explicit order first', () => {
		expect.hasAssertions();

		expect(
			normalizeCustomFieldOrder({ alpha: 'A', bravo: 'B', charlie: 'C' }, [
				'charlie',
				'missing',
				'alpha',
				'alpha'
			])
		).toEqual(['charlie', 'alpha', 'bravo']);
	});

	it('propagates template structure to linked cards while preserving matching field values', () => {
		expect.hasAssertions();

		const card = createCard();
		card.templateId = 'template-1';
		card.templateState = 'linked';
		card.descriptionMarkdown = 'Old description';
		card.customFields = { priority: 'Card value', estimate: 3, removed: 'gone' };
		card.customFieldOrder = ['estimate', 'removed', 'priority'];

		const template: CardTemplateRecord = {
			id: 'template-1',
			boardId: 'board-1',
			name: 'Feature',
			descriptionMarkdown: 'New description',
			labelIds: ['label-1'],
			dates: [{ id: 'due-1', type: 'due', label: 'Due', date: '2026-06-01' }],
			customFields: { status: 'Todo', priority: 'Template default', estimate: 8 },
			customFieldOrder: ['status', 'priority', 'estimate'],
			createdAt: timestamp,
			updatedAt: timestamp
		};

		const next = applyTemplateStructureToLinkedCard(card, template, '2026-05-16T10:00:00.000Z');

		expect(next).toMatchObject({
			templateId: 'template-1',
			templateState: 'linked',
			descriptionMarkdown: 'New description',
			labelIds: ['label-1'],
			customFields: {
				status: 'Todo',
				priority: 'Card value',
				estimate: 3
			},
			customFieldOrder: ['status', 'priority', 'estimate'],
			updatedAt: '2026-05-16T10:00:00.000Z'
		});
		expect(next.customFields).not.toHaveProperty('removed');
	});

	it('creates a template from a custom card without losing field contents', () => {
		expect.hasAssertions();

		const card = createCard();
		card.descriptionMarkdown = 'Card notes';
		card.labelIds = ['label-1'];
		card.dates = [{ id: 'date-1', type: 'milestone', label: 'Gate', date: '2026-07-01' }];
		card.customFields = { priority: 'Card value', estimate: 5 };
		card.customFieldOrder = ['estimate', 'priority'];

		const template = createTemplateFromCard(
			card,
			'Saved custom card',
			'2026-05-16T10:00:00.000Z',
			'template-2'
		);

		expect(template).toMatchObject({
			id: 'template-2',
			boardId: card.boardId,
			name: 'Saved custom card',
			descriptionMarkdown: 'Card notes',
			labelIds: ['label-1'],
			customFields: { priority: 'Card value', estimate: 5 },
			customFieldOrder: ['estimate', 'priority'],
			createdAt: '2026-05-16T10:00:00.000Z',
			updatedAt: '2026-05-16T10:00:00.000Z'
		});
		expect(template.dates).toEqual(card.dates);
		expect(template.dates).not.toBe(card.dates);
	});

	it('creates empty values for newly added custom fields', () => {
		expect.hasAssertions();

		expect(emptyCustomFieldValue(createField('checkbox'))).toBe(false);
		expect(emptyCustomFieldValue(createField('number'))).toBeNull();
		expect(emptyCustomFieldValue(createField('multiselect'))).toEqual([]);
		expect(emptyCustomFieldValue(createField('text'))).toBe('');
	});

	it('removes deleted field and label references from cards and templates', () => {
		expect.hasAssertions();

		const card = createCard();
		card.customFields = { keep: 'yes', remove: 'no' };
		card.customFieldOrder = ['remove', 'keep'];
		card.labelIds = ['keep-label', 'remove-label'];

		const [fieldCleaned] = removeCustomFieldValues([card], 'remove');
		const [labelCleaned] = removeLabelReferences([card], 'remove-label');

		expect(fieldCleaned.customFields).toEqual({ keep: 'yes' });
		expect(fieldCleaned.customFieldOrder).toEqual(['keep']);
		expect(labelCleaned.labelIds).toEqual(['keep-label']);
	});
});

function createCard(): CardRecord {
	return {
		id: 'card-1',
		boardId: 'board-1',
		stackId: 'stack-1',
		name: 'Keep this name',
		templateId: null,
		templateState: 'custom',
		descriptionMarkdown: 'Old description',
		labelIds: [],
		dates: [],
		customFields: {},
		customFieldOrder: [],
		comments: [
			{ id: 'comment-1', bodyMarkdown: 'Keep me', createdAt: timestamp, updatedAt: timestamp }
		],
		position: 1000,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

function createField(
	type: CustomFieldDefinition['type'],
	options: CustomFieldDefinition['options'] = []
): CustomFieldDefinition {
	return {
		id: `${type}-field`,
		boardId: 'board-1',
		name: type,
		type,
		options,
		showOnCard: true,
		position: 1000,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}
