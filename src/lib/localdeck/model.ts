import { nanoid } from 'nanoid';

import type {
	CardChecklist,
	CardChecklistItem,
	CardDateEntry,
	CardRecord,
	CardTemplateRecord,
	CardTemplateState,
	CustomFieldDefinition,
	CustomFieldOption,
	CustomFieldValue
} from './types';

const emptyCardFields = {
	descriptionMarkdown: '',
	labelIds: [],
	dates: [],
	checklists: [],
	customFields: {},
	customFieldOrder: []
};

export function createBlankTemplateRecord(
	boardId: string,
	timestamp: string,
	id: string = nanoid()
): CardTemplateRecord {
	return {
		id,
		boardId,
		name: 'Blank',
		...emptyCardFields,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

export function createTemplateFromCard(
	card: CardRecord,
	name: string,
	timestamp: string,
	id: string = nanoid()
): CardTemplateRecord {
	const normalizedCard = normalizeCardRecord(card);

	return {
		id,
		boardId: normalizedCard.boardId,
		name: name.trim() || `${normalizedCard.name} template`,
		descriptionMarkdown: normalizedCard.descriptionMarkdown,
		labelIds: [...normalizedCard.labelIds],
		dates: normalizedCard.dates.map(copyDateEntry),
		checklists: copyChecklists(normalizedCard.checklists),
		customFields: { ...normalizedCard.customFields },
		customFieldOrder: [...normalizedCard.customFieldOrder],
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

export function cardTemplateFields(template: CardTemplateRecord | null) {
	const normalizedTemplate = template ? normalizeTemplateRecord(template) : null;

	return {
		templateId: normalizedTemplate?.id ?? null,
		templateState: normalizedTemplate
			? ('linked' as CardTemplateState)
			: ('custom' as CardTemplateState),
		descriptionMarkdown: normalizedTemplate?.descriptionMarkdown ?? '',
		labelIds: [...(normalizedTemplate?.labelIds ?? [])],
		dates: (normalizedTemplate?.dates ?? []).map(copyDateEntry),
		checklists: copyChecklists(normalizedTemplate?.checklists ?? []),
		customFields: { ...(normalizedTemplate?.customFields ?? {}) },
		customFieldOrder: [...(normalizedTemplate?.customFieldOrder ?? [])]
	};
}

export function applyTemplateToCard(
	card: CardRecord,
	template: CardTemplateRecord,
	timestamp: string
): CardRecord {
	const normalizedCard = normalizeCardRecord(card);

	return {
		...normalizedCard,
		...cardTemplateFields(template),
		name: normalizedCard.name,
		comments: normalizedCard.comments,
		createdAt: normalizedCard.createdAt,
		updatedAt: timestamp
	};
}

export function applyTemplateStructureToLinkedCard(
	card: CardRecord,
	template: CardTemplateRecord,
	timestamp: string
): CardRecord {
	const normalizedCard = normalizeCardRecord(card);
	const normalizedTemplate = normalizeTemplateRecord(template);
	const customFields = Object.fromEntries(
		normalizedTemplate.customFieldOrder.map((fieldId) => [
			fieldId,
			Object.prototype.hasOwnProperty.call(normalizedCard.customFields, fieldId)
				? normalizedCard.customFields[fieldId]
				: normalizedTemplate.customFields[fieldId]
		])
	);

	return {
		...normalizedCard,
		templateId: normalizedTemplate.id,
		templateState: 'linked',
		descriptionMarkdown: normalizedTemplate.descriptionMarkdown,
		labelIds: [...normalizedTemplate.labelIds],
		dates: normalizedTemplate.dates.map(copyDateEntry),
		checklists: copyChecklists(normalizedTemplate.checklists),
		customFields,
		customFieldOrder: [...normalizedTemplate.customFieldOrder],
		updatedAt: timestamp
	};
}

export function normalizeCustomFieldValue(
	field: Pick<CustomFieldDefinition, 'type' | 'options'>,
	value: CustomFieldValue
): CustomFieldValue {
	const optionIds = new Set(field.options.map((option) => option.id));

	switch (field.type) {
		case 'checkbox':
			return Boolean(value);
		case 'number':
			if (value === '' || value === null) return null;
			return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || null;
		case 'multiselect':
			return Array.isArray(value) ? value.filter((item) => optionIds.has(item)) : [];
		case 'select':
			return typeof value === 'string' && optionIds.has(value) ? value : '';
		case 'text':
		case 'multiline':
		case 'date':
		case 'url':
			return typeof value === 'string' ? value : '';
		default:
			return value;
	}
}

export function customFieldInputValue(
	field: Pick<CustomFieldDefinition, 'type'>,
	value: string
): CustomFieldValue {
	if (field.type !== 'number') return value;
	return value === '' ? null : Number(value);
}

export function emptyCustomFieldValue(
	field: Pick<CustomFieldDefinition, 'type' | 'options'>
): CustomFieldValue {
	switch (field.type) {
		case 'checkbox':
			return false;
		case 'number':
			return null;
		case 'multiselect':
			return [];
		case 'select':
		case 'text':
		case 'multiline':
		case 'date':
		case 'url':
			return '';
		default:
			return null;
	}
}

export function createCustomFieldOption(name: string, id: string = nanoid()): CustomFieldOption {
	return { id, name: name.trim() };
}

export function parseOptionsDraft(
	draft: string,
	existing?: Pick<CustomFieldDefinition, 'options'>
): CustomFieldOption[] {
	const existingByName = new Map(existing?.options.map((option) => [option.name, option]) ?? []);
	const names = draft
		.split(/\r?\n|,/)
		.map((option) => option.trim())
		.filter(Boolean);
	const uniqueNames = names.filter((name, index) => names.indexOf(name) === index);

	return uniqueNames.map((name) => existingByName.get(name) ?? createCustomFieldOption(name));
}

export function normalizeExplicitCustomFields(
	fields: Pick<CustomFieldDefinition, 'id' | 'type' | 'options'>[],
	values: Record<string, CustomFieldValue>
) {
	const fieldsById = new Map(fields.map((field) => [field.id, field]));

	return Object.fromEntries(
		Object.entries(values).flatMap(([fieldId, value]) => {
			const field = fieldsById.get(fieldId);
			return field ? [[fieldId, normalizeCustomFieldValue(field, value)]] : [];
		})
	);
}

export function normalizeCustomFieldOrder(
	customFields: Record<string, CustomFieldValue>,
	order?: string[]
) {
	const fieldIds = Object.keys(customFields);
	const ordered = (order ?? []).filter(
		(fieldId, index, entries) => fieldIds.includes(fieldId) && entries.indexOf(fieldId) === index
	);
	const missing = fieldIds.filter((fieldId) => !ordered.includes(fieldId));

	return [...ordered, ...missing];
}

export function normalizeTemplateRecord(template: CardTemplateRecord): CardTemplateRecord {
	return {
		...template,
		checklists: normalizeChecklists(template.checklists),
		customFieldOrder: normalizeCustomFieldOrder(template.customFields, template.customFieldOrder)
	};
}

export function normalizeCardRecord(card: CardRecord): CardRecord {
	return {
		...card,
		templateState: card.templateState ?? (card.templateId ? 'linked' : 'custom'),
		checklists: normalizeChecklists(card.checklists),
		customFieldOrder: normalizeCustomFieldOrder(card.customFields, card.customFieldOrder)
	};
}

export function removeCustomFieldValues<
	T extends { customFields: Record<string, CustomFieldValue>; customFieldOrder?: string[] }
>(items: T[], fieldId: string) {
	return items.map((item) => {
		const customFields = { ...item.customFields };
		delete customFields[fieldId];
		return {
			...item,
			customFields,
			customFieldOrder: normalizeCustomFieldOrder(customFields, item.customFieldOrder).filter(
				(id) => id !== fieldId
			)
		};
	});
}

export function removeLabelReferences<T extends { labelIds: string[] }>(
	items: T[],
	labelId: string
) {
	return items.map((item) => ({
		...item,
		labelIds: item.labelIds.filter((id) => id !== labelId)
	}));
}

export function copyDateEntry(date: CardDateEntry): CardDateEntry {
	return { ...date };
}

export function createChecklist(
	name: string,
	position: number,
	timestamp: string,
	id: string = nanoid()
): CardChecklist {
	return {
		id,
		name: name.trim() || 'Checklist',
		items: [],
		position,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

export function createChecklistItem(
	label: string,
	parentId: string | null,
	position: number,
	timestamp: string,
	id: string = nanoid()
): CardChecklistItem {
	return {
		id,
		label,
		checked: false,
		parentId,
		position,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

export function copyChecklists(checklists: CardChecklist[]): CardChecklist[] {
	return normalizeChecklists(checklists).map((checklist) => ({
		...checklist,
		items: checklist.items.map((item) => ({ ...item }))
	}));
}

export function normalizeChecklists(checklists: unknown): CardChecklist[] {
	if (!Array.isArray(checklists)) return [];

	return checklists
		.filter(isRecord)
		.map((checklist, checklistIndex) => {
			const fallbackTimestamp = new Date(0).toISOString();
			const id = typeof checklist.id === 'string' && checklist.id ? checklist.id : nanoid();
			const createdAt =
				typeof checklist.createdAt === 'string' ? checklist.createdAt : fallbackTimestamp;
			const updatedAt = typeof checklist.updatedAt === 'string' ? checklist.updatedAt : createdAt;
			return {
				id,
				name:
					typeof checklist.name === 'string' && checklist.name.trim()
						? checklist.name
						: 'Checklist',
				items: normalizeChecklistItems(checklist.items),
				position: finitePosition(checklist.position, checklistIndex),
				createdAt,
				updatedAt
			};
		})
		.sort(byPositionThenCreated);
}

export function normalizeChecklistItems(items: unknown): CardChecklistItem[] {
	if (!Array.isArray(items)) return [];

	const normalized = items.filter(isRecord).map((item, itemIndex) => {
		const fallbackTimestamp = new Date(0).toISOString();
		const id = typeof item.id === 'string' && item.id ? item.id : nanoid();
		const createdAt = typeof item.createdAt === 'string' ? item.createdAt : fallbackTimestamp;
		const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
		return {
			id,
			label: typeof item.label === 'string' ? item.label : '',
			checked: Boolean(item.checked),
			parentId: typeof item.parentId === 'string' ? item.parentId : null,
			position: finitePosition(item.position, itemIndex),
			createdAt,
			updatedAt
		};
	});
	const ids = new Set(normalized.map((item) => item.id));
	const unique = normalized.filter(
		(item, index, entries) => entries.findIndex((entry) => entry.id === item.id) === index
	);

	return unique
		.map((item) => ({
			...item,
			parentId:
				item.parentId &&
				ids.has(item.parentId) &&
				!hasChecklistCycle(item.id, item.parentId, unique)
					? item.parentId
					: null
		}))
		.sort(byPositionThenCreated);
}

export type ChecklistDisplayItem = {
	item: CardChecklistItem;
	depth: number;
};

export function checklistDisplayItems(
	checklist: Pick<CardChecklist, 'items'>
): ChecklistDisplayItem[] {
	const items = normalizeChecklistItems(checklist.items);
	const children = new Map<string | null, CardChecklistItem[]>();

	for (const item of items) {
		const siblings = children.get(item.parentId) ?? [];
		siblings.push(item);
		children.set(item.parentId, siblings);
	}
	for (const siblings of children.values()) siblings.sort(byPositionThenCreated);

	const display: ChecklistDisplayItem[] = [];
	const visit = (parentId: string | null, depth: number) => {
		for (const item of children.get(parentId) ?? []) {
			display.push({ item, depth });
			visit(item.id, depth + 1);
		}
	};
	visit(null, 0);
	return display;
}

export function checklistProgress(checklists: CardChecklist[]) {
	const items = normalizeChecklists(checklists).flatMap((checklist) =>
		checklist.items.filter((item) => item.label.trim())
	);
	return {
		checked: items.filter((item) => item.checked).length,
		total: items.length
	};
}

function finitePosition(value: unknown, index: number) {
	return typeof value === 'number' && Number.isFinite(value) ? value : (index + 1) * 1000;
}

function byPositionThenCreated<T extends { position: number; createdAt: string; id: string }>(
	left: T,
	right: T
) {
	return (
		left.position - right.position ||
		left.createdAt.localeCompare(right.createdAt) ||
		left.id.localeCompare(right.id)
	);
}

function hasChecklistCycle(
	itemId: string,
	parentId: string,
	items: Pick<CardChecklistItem, 'id' | 'parentId'>[]
) {
	const parents = new Map(items.map((item) => [item.id, item.parentId]));
	const seen = new Set<string>([itemId]);
	let current: string | null = parentId;

	while (current) {
		if (seen.has(current)) return true;
		seen.add(current);
		current = parents.get(current) ?? null;
	}
	return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
