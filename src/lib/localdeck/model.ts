import { nanoid } from 'nanoid';

import type {
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
		customFieldOrder: normalizeCustomFieldOrder(template.customFields, template.customFieldOrder)
	};
}

export function normalizeCardRecord(card: CardRecord): CardRecord {
	return {
		...card,
		templateState: card.templateState ?? (card.templateId ? 'linked' : 'custom'),
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
