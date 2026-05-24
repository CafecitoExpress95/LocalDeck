import { strFromU8, unzipSync } from 'fflate';

import {
	BOARD_ARCHIVE_APP_NAME,
	BOARD_ARCHIVE_EXPORT_INFO_PATH,
	BOARD_ARCHIVE_FOLDERS,
	BOARD_ARCHIVE_FORMAT,
	BOARD_ARCHIVE_FORMAT_VERSION,
	BOARD_ARCHIVE_ROOT_FILES
} from './boardArchiveConstants';
import type {
	BoardArchiveBoardFile,
	BoardArchiveExportInfo,
	BoardArchiveManifest,
	BoardArchivePayload,
	BoardArchiveValidationIssue,
	BoardArchiveValidationResult
} from './boardArchiveTypes';
import type {
	CardChecklist,
	CardChecklistItem,
	CardComment,
	CardDateEntry,
	CardRecord,
	CardTemplateRecord,
	CustomFieldDefinition,
	CustomFieldOption,
	CustomFieldType,
	LabelRecord,
	StackRecord
} from '../types';
import { normalizeLabelRecords } from '../model';

type ArchiveFiles = Record<string, Uint8Array>;
type ParsedObject<T> = { path: string; value: T };

const customFieldTypes: CustomFieldType[] = [
	'text',
	'multiline',
	'number',
	'checkbox',
	'select',
	'multiselect',
	'date',
	'url'
];

export function validateBoardArchive(
	bytes: ArrayBuffer | Uint8Array
): BoardArchiveValidationResult {
	const errors: BoardArchiveValidationIssue[] = [];
	const warnings: BoardArchiveValidationIssue[] = [];
	let files: ArchiveFiles;

	try {
		files = unzipSync(toBytes(bytes));
	} catch {
		return {
			valid: false,
			errors: [{ message: 'Import failed because this file is not a valid ZIP archive.' }],
			warnings
		};
	}

	for (const path of BOARD_ARCHIVE_ROOT_FILES) {
		if (!hasFile(files, path))
			errors.push({ path, message: `Import failed because ${path} is missing.` });
	}
	for (const folder of BOARD_ARCHIVE_FOLDERS) {
		if (!hasFolder(files, folder)) {
			errors.push({ path: folder, message: `Import failed because ${folder} is missing.` });
		}
	}
	if (errors.length > 0) return { valid: false, errors, warnings };

	const manifest = readJson<BoardArchiveManifest>(files, 'manifest.json', errors);
	const board = readJson<BoardArchiveBoardFile>(files, 'board.json', errors);
	const exportInfo = hasFile(files, BOARD_ARCHIVE_EXPORT_INFO_PATH)
		? readJson<BoardArchiveExportInfo>(files, BOARD_ARCHIVE_EXPORT_INFO_PATH, errors)
		: null;

	const stackObjects = discoverStacks(files, errors);
	const cardObjects = discoverCards(files, stackObjects, errors, warnings);
	const templates = discoverTypedFiles<CardTemplateRecord>(files, 'templates/', errors);
	const customFields = discoverTypedFiles<CustomFieldDefinition>(files, 'custom-fields/', errors);
	const labels = discoverTypedFiles<LabelRecord>(files, 'labels/', errors);

	if (errors.length > 0) return { valid: false, errors, warnings };
	if (!manifest || !board) {
		return {
			valid: false,
			errors: [{ message: 'Import failed because required archive metadata could not be read.' }],
			warnings
		};
	}

	validateManifest(manifest, board, errors);
	validateBoard(board, errors);

	const payload: BoardArchivePayload = {
		manifest,
		board,
		stacks: stackObjects.map((item) => item.value),
		cards: cardObjects.map((item) => item.value),
		templates: templates.map((item) => item.value),
		customFields: customFields.map((item) => item.value),
		labels: normalizeDiscoveredLabels(labels, warnings),
		exportInfo: exportInfo ?? undefined
	};

	validateRecords(payload, errors, warnings);

	return errors.length > 0
		? { valid: false, errors, warnings }
		: { valid: true, payload, warnings };
}

function toBytes(bytes: ArrayBuffer | Uint8Array) {
	return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function hasFile(files: ArchiveFiles, path: string) {
	return Object.prototype.hasOwnProperty.call(files, path) && !path.endsWith('/');
}

function hasFolder(files: ArchiveFiles, folder: string) {
	return Object.keys(files).some((path) => path === folder || path.startsWith(folder));
}

function readJson<T>(files: ArchiveFiles, path: string, errors: BoardArchiveValidationIssue[]) {
	try {
		return JSON.parse(strFromU8(files[path])) as T;
	} catch {
		errors.push({ path, message: `Import failed because ${path} contains invalid JSON.` });
		return null;
	}
}

function discoverStacks(files: ArchiveFiles, errors: BoardArchiveValidationIssue[]) {
	const stackFolders = childFolders(files, 'stacks/');
	const stacks: ParsedObject<StackRecord>[] = [];

	for (const folder of stackFolders) {
		const stackPath = `${folder}stack.json`;
		const cardsFolder = `${folder}cards/`;
		if (!hasFile(files, stackPath)) {
			errors.push({ path: stackPath, message: `Import failed because ${stackPath} is missing.` });
			continue;
		}
		if (!hasFolder(files, cardsFolder)) {
			errors.push({
				path: cardsFolder,
				message: `Import failed because ${cardsFolder} is missing.`
			});
		}
		const stack = readJson<StackRecord>(files, stackPath, errors);
		if (stack) stacks.push({ path: stackPath, value: stack });
	}

	return stacks;
}

function discoverCards(
	files: ArchiveFiles,
	stacks: ParsedObject<StackRecord>[],
	errors: BoardArchiveValidationIssue[],
	warnings: BoardArchiveValidationIssue[]
) {
	const cards: ParsedObject<CardRecord>[] = [];
	const stackIdByFolder = new Map(
		stacks.map((stack) => [parentFolder(stack.path), stack.value.id])
	);

	for (const [stackFolder, stackId] of stackIdByFolder) {
		for (const cardFolder of childFolders(files, `${stackFolder}cards/`)) {
			const cardPath = `${cardFolder}card.json`;
			if (!hasFile(files, cardPath)) {
				errors.push({
					path: cardPath,
					message: `Import failed because ${cardPath} is missing.`
				});
				continue;
			}
			const card = readJson<CardRecord>(files, cardPath, errors);
			if (!card) continue;
			if (card.stackId !== stackId) {
				warnings.push({
					path: cardPath,
					message: `Import warning: a card folder is under "${stackFolder}", but card.json points to "${card.stackId}"; LocalDeck used card.json.stackId.`
				});
			}
			cards.push({ path: cardPath, value: card });
		}
	}

	return cards;
}

function discoverTypedFiles<T>(
	files: ArchiveFiles,
	folder: 'templates/' | 'custom-fields/' | 'labels/',
	errors: BoardArchiveValidationIssue[]
) {
	return Object.keys(files)
		.filter((path) => path.startsWith(folder) && path.endsWith('.json') && !path.endsWith('/'))
		.sort()
		.flatMap((path) => {
			const value = readJson<T>(files, path, errors);
			return value ? [{ path, value }] : [];
		});
}

function childFolders(files: ArchiveFiles, folder: string) {
	const folders = new Set<string>();
	for (const path of Object.keys(files)) {
		if (!path.startsWith(folder) || path === folder) continue;
		const remainder = path.slice(folder.length);
		const [child] = remainder.split('/');
		if (child) folders.add(`${folder}${child}/`);
	}
	return [...folders].sort();
}

function parentFolder(path: string) {
	return path.slice(0, path.lastIndexOf('/', path.length - 2) + 1);
}

function validateManifest(
	manifest: BoardArchiveManifest,
	board: BoardArchiveBoardFile,
	errors: BoardArchiveValidationIssue[]
) {
	if (!isObject(manifest) || manifest.format !== BOARD_ARCHIVE_FORMAT) {
		errors.push({
			path: 'manifest.json',
			message: 'Import failed because this file is not a LocalDeck .board archive.'
		});
		return;
	}
	if (manifest.formatVersion > BOARD_ARCHIVE_FORMAT_VERSION) {
		errors.push({
			path: 'manifest.json',
			message:
				'Import failed because this board format version is newer than this version of LocalDeck supports.'
		});
	}
	if (manifest.formatVersion !== BOARD_ARCHIVE_FORMAT_VERSION) {
		errors.push({
			path: 'manifest.json',
			message: 'Import failed because formatVersion is unsupported.'
		});
	}
	if (manifest.appName !== BOARD_ARCHIVE_APP_NAME) {
		errors.push({
			path: 'manifest.json',
			message: 'Import failed because appName is not LocalDeck.'
		});
	}
	if (manifest.encrypted !== false) {
		errors.push({
			path: 'manifest.json',
			message: 'Import failed because encrypted .board archives are not supported in v0.3.'
		});
	}
	if (manifest.boardId !== board.id) {
		errors.push({
			path: 'manifest.json',
			message: 'Import failed because manifest boardId does not match board.json.'
		});
	}
	if (manifest.boardName !== board.name) {
		errors.push({
			path: 'manifest.json',
			message: 'Import failed because manifest boardName does not match board.json.'
		});
	}
}

function validateBoard(board: BoardArchiveBoardFile, errors: BoardArchiveValidationIssue[]) {
	requireString(board, 'id', 'board.json', errors);
	requireString(board, 'name', 'board.json', errors);
	requireNullableString(board, 'defaultTemplateId', 'board.json', errors);
	requireString(board, 'createdAt', 'board.json', errors);
	requireString(board, 'updatedAt', 'board.json', errors);
	if (board.stackOrder !== undefined && !isStringArray(board.stackOrder)) {
		errors.push({
			path: 'board.json',
			message: 'Import failed because board.json stackOrder must be an array of stack IDs.'
		});
	}
}

function validateRecords(
	payload: BoardArchivePayload,
	errors: BoardArchiveValidationIssue[],
	warnings: BoardArchiveValidationIssue[]
) {
	const boardId = payload.board.id;
	const stackIds = validateUnique(payload.stacks, 'stack', errors);
	const cardIds = validateUnique(payload.cards, 'card', errors);
	const templateIds = validateUnique(payload.templates, 'template', errors);
	const customFieldIds = validateUnique(payload.customFields, 'custom field', errors);
	const labelIds = validateUnique(payload.labels, 'label', errors);

	void cardIds;

	for (const stack of payload.stacks) validateStack(stack, boardId, errors);
	for (const field of payload.customFields) validateCustomField(field, boardId, errors);
	for (const label of payload.labels) validateLabel(label, boardId, errors);
	for (const template of payload.templates) {
		validateTemplate(template, boardId, templateIds, customFieldIds, labelIds, errors, warnings);
	}
	for (const card of payload.cards) {
		validateCard(card, boardId, stackIds, templateIds, customFieldIds, labelIds, errors, warnings);
	}

	if (payload.board.defaultTemplateId && !templateIds.has(payload.board.defaultTemplateId)) {
		errors.push({
			path: 'board.json',
			message: `Import failed because board defaultTemplateId references missing template ${payload.board.defaultTemplateId}.`
		});
	}
	for (const stackId of payload.board.stackOrder ?? []) {
		if (!stackIds.has(stackId)) {
			errors.push({
				path: 'board.json',
				message: `Import failed because board stackOrder references missing stack ${stackId}.`
			});
		}
	}
}

function validateStack(stack: StackRecord, boardId: string, errors: BoardArchiveValidationIssue[]) {
	requireString(stack, 'id', 'stack.json', errors);
	requireBoardId(stack, boardId, 'stack', errors);
	requireString(stack, 'name', 'stack.json', errors);
	requireNumber(stack, 'position', 'stack.json', errors);
	requireString(stack, 'createdAt', 'stack.json', errors);
	requireString(stack, 'updatedAt', 'stack.json', errors);
}

function validateCard(
	card: CardRecord,
	boardId: string,
	stackIds: Set<string>,
	templateIds: Set<string>,
	customFieldIds: Set<string>,
	labelIds: Set<string>,
	errors: BoardArchiveValidationIssue[],
	warnings: BoardArchiveValidationIssue[]
) {
	requireString(card, 'id', 'card.json', errors);
	requireBoardId(card, boardId, `card "${card.name ?? card.id}"`, errors);
	requireString(card, 'stackId', 'card.json', errors);
	requireString(card, 'name', 'card.json', errors);
	requireNullableString(card, 'templateId', 'card.json', errors);
	requireString(card, 'templateState', 'card.json', errors);
	requireString(card, 'descriptionMarkdown', 'card.json', errors);
	requireNumber(card, 'position', 'card.json', errors);
	requireString(card, 'createdAt', 'card.json', errors);
	requireString(card, 'updatedAt', 'card.json', errors);

	if (!stackIds.has(card.stackId)) {
		errors.push({
			message: `Import failed because card "${card.name}" references missing stack ${card.stackId}.`
		});
	}
	if (card.templateId && !templateIds.has(card.templateId)) {
		errors.push({
			message: `Import failed because card "${card.name}" references missing template ${card.templateId}.`
		});
	}
	validateStructuredFields(
		`card "${card.name}"`,
		card.labelIds,
		card.dates,
		card.customFields,
		card.customFieldOrder,
		customFieldIds,
		labelIds,
		errors,
		warnings
	);
	validateChecklists(`card "${card.name}"`, card.checklists, errors);
	if (!Array.isArray(card.comments)) {
		errors.push({
			message: `Import failed because card "${card.name}" comments must be an array.`
		});
	} else {
		for (const comment of card.comments) validateComment(comment, card.name, errors);
	}
}

function validateTemplate(
	template: CardTemplateRecord,
	boardId: string,
	templateIds: Set<string>,
	customFieldIds: Set<string>,
	labelIds: Set<string>,
	errors: BoardArchiveValidationIssue[],
	warnings: BoardArchiveValidationIssue[]
) {
	void templateIds;
	requireString(template, 'id', 'template.json', errors);
	requireBoardId(template, boardId, `template "${template.name ?? template.id}"`, errors);
	requireString(template, 'name', 'template.json', errors);
	requireString(template, 'descriptionMarkdown', 'template.json', errors);
	requireString(template, 'createdAt', 'template.json', errors);
	requireString(template, 'updatedAt', 'template.json', errors);
	validateStructuredFields(
		`template "${template.name}"`,
		template.labelIds,
		template.dates,
		template.customFields,
		template.customFieldOrder,
		customFieldIds,
		labelIds,
		errors,
		warnings
	);
	validateChecklists(`template "${template.name}"`, template.checklists, errors);
}

function validateCustomField(
	field: CustomFieldDefinition,
	boardId: string,
	errors: BoardArchiveValidationIssue[]
) {
	requireString(field, 'id', 'custom field', errors);
	requireBoardId(field, boardId, `custom field "${field.name ?? field.id}"`, errors);
	requireString(field, 'name', 'custom field', errors);
	if (!customFieldTypes.includes(field.type)) {
		errors.push({
			message: `Import failed because custom field "${field.name}" has unsupported type.`
		});
	}
	if (!Array.isArray(field.options)) {
		errors.push({
			message: `Import failed because custom field "${field.name}" options must be an array.`
		});
	} else {
		validateUnique(field.options, `option in custom field "${field.name}"`, errors);
		for (const option of field.options) validateOption(option, field.name, errors);
	}
	if (typeof field.showOnCard !== 'boolean') {
		errors.push({
			message: `Import failed because custom field "${field.name}" showOnCard must be boolean.`
		});
	}
	requireNumber(field, 'position', 'custom field', errors);
	requireString(field, 'createdAt', 'custom field', errors);
	requireString(field, 'updatedAt', 'custom field', errors);
}

function validateLabel(label: LabelRecord, boardId: string, errors: BoardArchiveValidationIssue[]) {
	requireString(label, 'id', 'label', errors);
	requireBoardId(label, boardId, `label "${label.name ?? label.id}"`, errors);
	requireString(label, 'name', 'label', errors);
	requireString(label, 'color', 'label', errors);
	requireNumber(label, 'position', 'label', errors);
	requireString(label, 'createdAt', 'label', errors);
	requireString(label, 'updatedAt', 'label', errors);
}

function normalizeDiscoveredLabels(
	labels: ParsedObject<LabelRecord>[],
	warnings: BoardArchiveValidationIssue[]
) {
	const fallbackLabels = normalizeLabelRecords(labels.map((label) => label.value));

	return labels.map((label, index) => {
		if (!Object.prototype.hasOwnProperty.call(label.value, 'position')) {
			warnings.push({
				path: label.path,
				message: `Import warning: label "${label.value.name || label.value.id}" is missing position; LocalDeck restored label order from creation time.`
			});
			return fallbackLabels[index];
		}
		return label.value;
	});
}

function validateStructuredFields(
	owner: string,
	labelIdsValue: unknown,
	datesValue: unknown,
	customFieldsValue: unknown,
	customFieldOrderValue: unknown,
	customFieldIds: Set<string>,
	labelIds: Set<string>,
	errors: BoardArchiveValidationIssue[],
	warnings: BoardArchiveValidationIssue[]
) {
	if (!isStringArray(labelIdsValue)) {
		errors.push({ message: `Import failed because ${owner} labelIds must be an array.` });
	} else {
		for (const labelId of labelIdsValue) {
			if (!labelIds.has(labelId)) {
				errors.push({
					message: `Import failed because ${owner} references missing label ${labelId}.`
				});
			}
		}
	}

	if (!Array.isArray(datesValue)) {
		errors.push({ message: `Import failed because ${owner} dates must be an array.` });
	} else {
		for (const date of datesValue) validateDate(date, owner, errors);
	}

	if (!isObject(customFieldsValue)) {
		errors.push({ message: `Import failed because ${owner} customFields must be an object.` });
		return;
	}

	for (const fieldId of Object.keys(customFieldsValue)) {
		if (!customFieldIds.has(fieldId)) {
			errors.push({
				message: `Import failed because ${owner} references missing custom field ${fieldId}.`
			});
		}
	}

	if (!isStringArray(customFieldOrderValue)) {
		errors.push({ message: `Import failed because ${owner} customFieldOrder must be an array.` });
		return;
	}

	const customFieldKeys = new Set(Object.keys(customFieldsValue));
	for (const fieldId of customFieldOrderValue) {
		if (!customFieldKeys.has(fieldId)) {
			errors.push({
				message: `Import failed because ${owner} customFieldOrder references field ${fieldId} that is not present on the object.`
			});
		}
		if (!customFieldIds.has(fieldId)) {
			warnings.push({
				message: `Import warning: ${owner} customFieldOrder includes unknown custom field ${fieldId}.`
			});
		}
	}
}

function validateDate(date: CardDateEntry, owner: string, errors: BoardArchiveValidationIssue[]) {
	requireString(date, 'id', `${owner} date`, errors);
	if (!['start', 'due', 'milestone', 'custom'].includes(date.type)) {
		errors.push({ message: `Import failed because ${owner} has a date with unsupported type.` });
	}
	requireString(date, 'label', `${owner} date`, errors);
	requireString(date, 'date', `${owner} date`, errors);
}

function validateComment(
	comment: CardComment,
	cardName: string,
	errors: BoardArchiveValidationIssue[]
) {
	requireString(comment, 'id', `comment on card "${cardName}"`, errors);
	requireString(comment, 'createdAt', `comment on card "${cardName}"`, errors);
	requireString(comment, 'updatedAt', `comment on card "${cardName}"`, errors);
	requireString(comment, 'bodyMarkdown', `comment on card "${cardName}"`, errors);
}

function validateChecklists(
	owner: string,
	checklistsValue: unknown,
	errors: BoardArchiveValidationIssue[]
) {
	if (checklistsValue === undefined) return;
	if (!Array.isArray(checklistsValue)) {
		errors.push({ message: `Import failed because ${owner} checklists must be an array.` });
		return;
	}

	validateUnique(checklistsValue.filter(isObject) as CardChecklist[], `${owner} checklist`, errors);
	for (const checklist of checklistsValue)
		validateChecklist(checklist as CardChecklist, owner, errors);
}

function validateChecklist(
	checklist: CardChecklist,
	owner: string,
	errors: BoardArchiveValidationIssue[]
) {
	if (!isObject(checklist)) {
		errors.push({ message: `Import failed because ${owner} has an invalid checklist.` });
		return;
	}

	const checklistOwner = `${owner} checklist "${checklist.name ?? checklist.id}"`;
	requireString(checklist, 'id', checklistOwner, errors);
	requireString(checklist, 'name', checklistOwner, errors);
	requireNumber(checklist, 'position', checklistOwner, errors);
	requireString(checklist, 'createdAt', checklistOwner, errors);
	requireString(checklist, 'updatedAt', checklistOwner, errors);
	if (!Array.isArray(checklist.items)) {
		errors.push({ message: `Import failed because ${checklistOwner} items must be an array.` });
		return;
	}

	const itemIds = validateUnique(
		checklist.items.filter(isObject) as CardChecklistItem[],
		`${checklistOwner} item`,
		errors
	);
	for (const item of checklist.items) validateChecklistItem(item, checklistOwner, itemIds, errors);
	validateChecklistParentLinks(checklist, checklistOwner, itemIds, errors);
}

function validateChecklistItem(
	item: CardChecklistItem,
	checklistOwner: string,
	itemIds: Set<string>,
	errors: BoardArchiveValidationIssue[]
) {
	if (!isObject(item)) {
		errors.push({ message: `Import failed because ${checklistOwner} has an invalid item.` });
		return;
	}

	const itemOwner = `${checklistOwner} item "${item.label ?? item.id}"`;
	requireString(item, 'id', itemOwner, errors);
	requireString(item, 'label', itemOwner, errors);
	if (typeof item.checked !== 'boolean') {
		errors.push({ message: `Import failed because ${itemOwner} checked must be boolean.` });
	}
	requireNullableString(item, 'parentId', itemOwner, errors);
	if (typeof item.parentId === 'string' && !itemIds.has(item.parentId)) {
		errors.push({
			message: `Import failed because ${itemOwner} parentId references missing checklist item ${item.parentId}.`
		});
	}
	requireNumber(item, 'position', itemOwner, errors);
	requireString(item, 'createdAt', itemOwner, errors);
	requireString(item, 'updatedAt', itemOwner, errors);
}

function validateChecklistParentLinks(
	checklist: CardChecklist,
	checklistOwner: string,
	itemIds: Set<string>,
	errors: BoardArchiveValidationIssue[]
) {
	const parents = new Map(
		checklist.items
			.filter((item) => isObject(item) && typeof item.id === 'string')
			.map((item) => [item.id, typeof item.parentId === 'string' ? item.parentId : null])
	);

	for (const itemId of itemIds) {
		const seen = new Set<string>([itemId]);
		let parentId = parents.get(itemId) ?? null;

		while (parentId) {
			if (seen.has(parentId)) {
				errors.push({
					message: `Import failed because ${checklistOwner} item ${itemId} has a circular parentId chain.`
				});
				break;
			}
			seen.add(parentId);
			parentId = parents.get(parentId) ?? null;
		}
	}
}

function validateOption(
	option: CustomFieldOption,
	fieldName: string,
	errors: BoardArchiveValidationIssue[]
) {
	requireString(option, 'id', `option in custom field "${fieldName}"`, errors);
	requireString(option, 'name', `option in custom field "${fieldName}"`, errors);
}

function validateUnique<T extends { id: string }>(
	items: T[],
	name: string,
	errors: BoardArchiveValidationIssue[]
) {
	const ids = new Set<string>();
	for (const item of items) {
		if (typeof item.id !== 'string') continue;
		if (ids.has(item.id)) {
			errors.push({ message: `Import failed because duplicate ${name} ID ${item.id} was found.` });
		}
		ids.add(item.id);
	}
	return ids;
}

function requireBoardId(
	value: { boardId?: unknown },
	boardId: string,
	owner: string,
	errors: BoardArchiveValidationIssue[]
) {
	if (value.boardId !== boardId) {
		errors.push({ message: `Import failed because ${owner} does not belong to board ${boardId}.` });
	}
}

function requireString(
	value: Record<string, unknown>,
	key: string,
	owner: string,
	errors: BoardArchiveValidationIssue[]
) {
	if (typeof value[key] !== 'string') {
		errors.push({ message: `Import failed because ${owner} ${key} must be a string.` });
	}
}

function requireNullableString(
	value: Record<string, unknown>,
	key: string,
	owner: string,
	errors: BoardArchiveValidationIssue[]
) {
	if (value[key] !== null && typeof value[key] !== 'string') {
		errors.push({ message: `Import failed because ${owner} ${key} must be a string or null.` });
	}
}

function requireNumber(
	value: Record<string, unknown>,
	key: string,
	owner: string,
	errors: BoardArchiveValidationIssue[]
) {
	if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
		errors.push({ message: `Import failed because ${owner} ${key} must be a number.` });
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
