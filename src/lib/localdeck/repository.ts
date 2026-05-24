import { nanoid } from 'nanoid';

import { db } from './db';
import {
	applyTemplateToCard,
	applyTemplateStructureToLinkedCard,
	cardTemplateFields,
	createBlankTemplateRecord,
	createCustomFieldOption as createModelCustomFieldOption,
	createTemplateFromCard,
	duplicateCardRecord,
	normalizeCustomFieldValue,
	normalizeCardRecord,
	normalizeLabelRecords,
	normalizeTemplateRecord,
	removeCustomFieldValues,
	removeLabelReferences
} from './model';
import type {
	BoardRecord,
	BoardSnapshot,
	CardComment,
	CardDateEntry,
	CardRecord,
	CardTemplateRecord,
	CustomFieldDefinition,
	CustomFieldOption,
	CustomFieldType,
	CustomFieldValue,
	LabelRecord,
	StackRecord
} from './types';
import type { BoardArchiveImportMode, BoardArchivePayload } from './board-file/boardArchiveTypes';

const now = () => new Date().toISOString();
const spacedPosition = (index: number) => (index + 1) * 1000;
const localdeckLabelColors = ['#314bef', '#197a50', '#b45309', '#b42318', '#636d82', '#111c38'];

const byPosition = <T extends { position: number; createdAt: string }>(left: T, right: T) =>
	left.position - right.position || left.createdAt.localeCompare(right.createdAt);

const normalizePositions = <T extends { position: number }>(items: T[]) =>
	items.map((item, index) => ({ ...item, position: spacedPosition(index) }));

export async function listBoards() {
	return db.boards.orderBy('updatedAt').reverse().toArray();
}

export async function getLastBoardId() {
	const preference = await db.preferences.get('lastBoardId');
	return preference?.value ?? null;
}

export async function setLastBoardId(boardId: string | null) {
	await db.preferences.put({ key: 'lastBoardId', value: boardId });
}

export async function boardExists(boardId: string) {
	return Boolean(await db.boards.get(boardId));
}

export async function createBoard(name: string) {
	const timestamp = now();
	const template = createBlankTemplateRecord(nanoid(), timestamp);
	const board: BoardRecord = {
		id: template.boardId,
		name: name.trim() || 'Untitled board',
		defaultTemplateId: template.id,
		createdAt: timestamp,
		updatedAt: timestamp
	};

	await db.transaction('rw', db.boards, db.stacks, db.templates, db.preferences, async () => {
		await db.boards.add(board);
		await db.templates.add(template);
		await db.stacks.bulkAdd([
			createStackRecord(board.id, 'To do', 0),
			createStackRecord(board.id, 'Doing', 1),
			createStackRecord(board.id, 'Done', 2)
		]);
		await db.preferences.put({ key: 'lastBoardId', value: board.id });
	});

	return board;
}

export async function renameBoard(boardId: string, name: string) {
	const trimmed = name.trim();
	if (!trimmed) return;

	await db.boards.update(boardId, { name: trimmed, updatedAt: now() });
}

export async function deleteBoard(boardId: string) {
	await db.transaction(
		'rw',
		[db.boards, db.stacks, db.cards, db.templates, db.customFields, db.labels, db.preferences],
		async () => {
			await Promise.all([
				db.cards.where('boardId').equals(boardId).delete(),
				db.stacks.where('boardId').equals(boardId).delete(),
				db.templates.where('boardId').equals(boardId).delete(),
				db.customFields.where('boardId').equals(boardId).delete(),
				db.labels.where('boardId').equals(boardId).delete(),
				db.boards.delete(boardId)
			]);

			const preference = await db.preferences.get('lastBoardId');
			if (preference?.value === boardId) {
				const fallback = await db.boards.orderBy('updatedAt').reverse().first();
				await db.preferences.put({ key: 'lastBoardId', value: fallback?.id ?? null });
			}
		}
	);
}

export async function loadBoard(boardId: string): Promise<BoardSnapshot | null> {
	const board = await db.boards.get(boardId);
	if (!board) return null;

	const [stacks, cards, templates, customFields, labels] = await Promise.all([
		db.stacks.where('boardId').equals(boardId).toArray(),
		db.cards.where('boardId').equals(boardId).toArray(),
		db.templates.where('boardId').equals(boardId).toArray(),
		db.customFields.where('boardId').equals(boardId).toArray(),
		db.labels.where('boardId').equals(boardId).toArray()
	]);

	return {
		board,
		stacks: stacks.sort(byPosition),
		cards: cards.map(normalizeCardRecord).sort(byPosition),
		templates: templates
			.map(normalizeTemplateRecord)
			.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
		customFields: customFields.sort(byPosition),
		labels: normalizeLabelRecords(labels).sort(byPosition)
	};
}

export async function importBoardSnapshot(
	payload: BoardArchivePayload,
	mode: BoardArchiveImportMode
): Promise<BoardRecord> {
	const snapshotPayload = mode === 'copy' ? await remapBoardArchiveForCopy(payload) : payload;
	const board = boardRecordFromArchive(snapshotPayload);

	if (mode === 'new' && (await boardExists(board.id))) {
		throw new Error(`A board named "${board.name}" already exists in LocalDeck.`);
	}

	await assertNoChildIdConflicts(snapshotPayload, mode === 'replace' ? board.id : null);

	await db.transaction(
		'rw',
		[db.boards, db.stacks, db.cards, db.templates, db.customFields, db.labels, db.preferences],
		async () => {
			if (mode === 'replace') {
				await Promise.all([
					db.cards.where('boardId').equals(board.id).delete(),
					db.stacks.where('boardId').equals(board.id).delete(),
					db.templates.where('boardId').equals(board.id).delete(),
					db.customFields.where('boardId').equals(board.id).delete(),
					db.labels.where('boardId').equals(board.id).delete(),
					db.boards.delete(board.id)
				]);
			}

			await db.boards.add(board);
			await db.stacks.bulkAdd(snapshotPayload.stacks);
			await db.cards.bulkAdd(snapshotPayload.cards.map(normalizeCardRecord));
			await db.templates.bulkAdd(snapshotPayload.templates.map(normalizeTemplateRecord));
			await db.customFields.bulkAdd(snapshotPayload.customFields);
			await db.labels.bulkAdd(normalizeLabelRecords(snapshotPayload.labels));
			await db.preferences.put({ key: 'lastBoardId', value: board.id });
		}
	);

	return board;
}

export async function remapBoardArchiveForCopy(
	payload: BoardArchivePayload
): Promise<BoardArchivePayload> {
	const boardId = nanoid();
	const stackIdMap = await collidingIdMap(payload.stacks, async (id) => db.stacks.get(id));
	const cardIdMap = await collidingIdMap(payload.cards, async (id) => db.cards.get(id));
	const templateIdMap = await collidingIdMap(payload.templates, async (id) => db.templates.get(id));
	const fieldIdMap = await collidingIdMap(payload.customFields, async (id) =>
		db.customFields.get(id)
	);
	const labelIdMap = await collidingIdMap(payload.labels, async (id) => db.labels.get(id));

	const board: BoardArchivePayload['board'] = {
		...payload.board,
		id: boardId,
		name: `${payload.board.name} copy`,
		defaultTemplateId: remapNullableId(payload.board.defaultTemplateId, templateIdMap),
		stackOrder: payload.board.stackOrder?.map((id) => stackIdMap.get(id) ?? id)
	};

	return {
		...payload,
		manifest: {
			...payload.manifest,
			boardId,
			boardName: board.name
		},
		board,
		stacks: payload.stacks.map((stack) => ({
			...stack,
			id: stackIdMap.get(stack.id) ?? stack.id,
			boardId
		})),
		cards: payload.cards.map((card) => ({
			...card,
			id: cardIdMap.get(card.id) ?? card.id,
			boardId,
			stackId: stackIdMap.get(card.stackId) ?? card.stackId,
			templateId: remapNullableId(card.templateId, templateIdMap),
			labelIds: card.labelIds.map((id) => labelIdMap.get(id) ?? id),
			customFields: remapCustomFields(card.customFields, fieldIdMap),
			customFieldOrder: card.customFieldOrder.map((id) => fieldIdMap.get(id) ?? id)
		})),
		templates: payload.templates.map((template) => ({
			...template,
			id: templateIdMap.get(template.id) ?? template.id,
			boardId,
			labelIds: template.labelIds.map((id) => labelIdMap.get(id) ?? id),
			customFields: remapCustomFields(template.customFields, fieldIdMap),
			customFieldOrder: template.customFieldOrder.map((id) => fieldIdMap.get(id) ?? id)
		})),
		customFields: payload.customFields.map((field) => ({
			...field,
			id: fieldIdMap.get(field.id) ?? field.id,
			boardId
		})),
		labels: payload.labels.map((label) => ({
			...label,
			id: labelIdMap.get(label.id) ?? label.id,
			boardId
		})),
		exportInfo: payload.exportInfo
			? { ...payload.exportInfo, boardId, boardName: board.name }
			: payload.exportInfo
	};
}

export function createStackRecord(boardId: string, name: string, index: number): StackRecord {
	const timestamp = now();
	return {
		id: nanoid(),
		boardId,
		name,
		position: spacedPosition(index),
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

export async function createStack(boardId: string, name: string, index: number) {
	const stack = createStackRecord(boardId, name.trim() || 'Untitled stack', index);
	await db.transaction('rw', db.stacks, db.boards, async () => {
		await db.stacks.add(stack);
		await db.boards.update(boardId, { updatedAt: now() });
	});
	return stack;
}

export async function renameStack(stackId: string, name: string) {
	const trimmed = name.trim();
	if (!trimmed) return;

	const stack = await db.stacks.get(stackId);
	if (!stack) return;

	await db.transaction('rw', db.stacks, db.boards, async () => {
		const timestamp = now();
		await db.stacks.update(stackId, { name: trimmed, updatedAt: timestamp });
		await db.boards.update(stack.boardId, { updatedAt: timestamp });
	});
}

export async function deleteStack(stackId: string) {
	const stack = await db.stacks.get(stackId);
	if (!stack) return;

	await db.transaction('rw', db.stacks, db.cards, db.boards, async () => {
		await db.cards.where('stackId').equals(stackId).delete();
		await db.stacks.delete(stackId);
		await db.boards.update(stack.boardId, { updatedAt: now() });
	});
}

export async function reorderStacks(boardId: string, stacks: StackRecord[]) {
	const timestamp = now();
	const updates = normalizePositions(stacks).map((stack) => ({ ...stack, updatedAt: timestamp }));

	await db.transaction('rw', db.stacks, db.boards, async () => {
		await db.stacks.bulkPut(updates);
		await db.boards.update(boardId, { updatedAt: timestamp });
	});

	return updates;
}

export async function createCard(
	boardId: string,
	stackId: string,
	name: string,
	index: number,
	templateId?: string | null
) {
	const timestamp = now();
	const template = await resolveTemplateForBoard(boardId, templateId);
	const card: CardRecord = {
		id: nanoid(),
		boardId,
		stackId,
		name: name.trim() || 'Untitled card',
		...cardTemplateFields(template),
		position: spacedPosition(index),
		comments: [],
		createdAt: timestamp,
		updatedAt: timestamp
	};

	await db.transaction('rw', db.cards, db.boards, async () => {
		await db.cards.add(card);
		await db.boards.update(boardId, { updatedAt: timestamp });
	});

	return card;
}

export async function updateCard(
	cardId: string,
	changes: Partial<
		Pick<
			CardRecord,
			| 'name'
			| 'descriptionMarkdown'
			| 'templateId'
			| 'templateState'
			| 'labelIds'
			| 'dates'
			| 'checklists'
			| 'customFields'
			| 'customFieldOrder'
		>
	>
) {
	const card = await db.cards.get(cardId);
	if (!card) return;

	const update: Partial<CardRecord> = { updatedAt: now() };
	if (changes.name !== undefined) update.name = changes.name.trim() || 'Untitled card';
	if (changes.descriptionMarkdown !== undefined)
		update.descriptionMarkdown = changes.descriptionMarkdown;
	if (changes.templateId !== undefined) update.templateId = changes.templateId;
	if (changes.templateState !== undefined) update.templateState = changes.templateState;
	if (changes.labelIds !== undefined) update.labelIds = changes.labelIds;
	if (changes.dates !== undefined) update.dates = changes.dates;
	if (changes.checklists !== undefined) update.checklists = changes.checklists;
	if (changes.customFields !== undefined) update.customFields = changes.customFields;
	if (changes.customFieldOrder !== undefined) update.customFieldOrder = changes.customFieldOrder;

	await db.transaction('rw', db.cards, db.boards, async () => {
		await db.cards.update(cardId, update);
		await db.boards.update(card.boardId, { updatedAt: update.updatedAt });
	});
}

export async function deleteCard(cardId: string) {
	const card = await db.cards.get(cardId);
	if (!card) return;

	await db.transaction('rw', db.cards, db.boards, async () => {
		await db.cards.delete(cardId);
		await db.boards.update(card.boardId, { updatedAt: now() });
	});
}

export async function moveCardToStack(cardId: string, stackId: string) {
	const [card, stack] = await Promise.all([db.cards.get(cardId), db.stacks.get(stackId)]);
	if (!card || !stack || card.boardId !== stack.boardId) return;
	if (card.stackId === stackId) return normalizeCardRecord(card);

	const timestamp = now();
	const [sourceCards, targetCards] = await Promise.all([
		db.cards.where('stackId').equals(card.stackId).toArray(),
		db.cards.where('stackId').equals(stackId).toArray()
	]);
	const movedCard = { ...normalizeCardRecord(card), stackId, updatedAt: timestamp };
	const sourceUpdates = normalizePositions(
		sourceCards.filter((item) => item.id !== cardId).sort(byPosition)
	).map((item) => ({ ...item, updatedAt: timestamp }));
	const targetUpdates = normalizePositions([
		...targetCards.filter((item) => item.id !== cardId).sort(byPosition),
		movedCard
	]).map((item) => ({ ...item, updatedAt: timestamp }));
	const updates = [...sourceUpdates, ...targetUpdates];

	await db.transaction('rw', db.cards, db.boards, async () => {
		await db.cards.bulkPut(updates);
		await db.boards.update(card.boardId, { updatedAt: timestamp });
	});

	return targetUpdates.find((item) => item.id === cardId);
}

export async function duplicateCard(cardId: string) {
	const card = await db.cards.get(cardId);
	if (!card) return;

	const timestamp = now();
	const stackCards = (await db.cards.where('stackId').equals(card.stackId).toArray())
		.map(normalizeCardRecord)
		.sort(byPosition);
	const sourceIndex = stackCards.findIndex((item) => item.id === cardId);
	if (sourceIndex < 0) return;

	const duplicate = duplicateCardRecord(stackCards[sourceIndex], 0, timestamp);
	const nextStackCards = [
		...stackCards.slice(0, sourceIndex + 1),
		duplicate,
		...stackCards.slice(sourceIndex + 1)
	];
	const stackUpdates = nextStackCards.map((item, index) => {
		const position = spacedPosition(index);
		return {
			...item,
			position,
			updatedAt: item.id === duplicate.id || item.position !== position ? timestamp : item.updatedAt
		};
	});

	await db.transaction('rw', db.cards, db.boards, async () => {
		await db.cards.bulkPut(stackUpdates);
		await db.boards.update(card.boardId, { updatedAt: timestamp });
	});

	return stackUpdates.find((item) => item.id === duplicate.id);
}

export async function reorderCards(boardId: string, cards: CardRecord[]) {
	const timestamp = now();
	const grouped = new Map<string, CardRecord[]>();

	for (const card of cards) {
		const group = grouped.get(card.stackId) ?? [];
		group.push(card);
		grouped.set(card.stackId, group);
	}

	const updates = Array.from(grouped.values()).flatMap((stackCards) =>
		normalizePositions(stackCards).map((card) => ({ ...card, updatedAt: timestamp }))
	);

	await db.transaction('rw', db.cards, db.boards, async () => {
		await db.cards.bulkPut(updates);
		await db.boards.update(boardId, { updatedAt: timestamp });
	});

	return updates;
}

export async function addComment(cardId: string, bodyMarkdown: string) {
	const card = await db.cards.get(cardId);
	const trimmed = bodyMarkdown.trim();
	if (!card || !trimmed) return;

	const timestamp = now();
	const comment: CardComment = {
		id: nanoid(),
		bodyMarkdown: trimmed,
		createdAt: timestamp,
		updatedAt: timestamp
	};

	await saveComments(card, [...card.comments, comment]);
}

export async function updateComment(cardId: string, commentId: string, bodyMarkdown: string) {
	const card = await db.cards.get(cardId);
	if (!card) return;

	const trimmed = bodyMarkdown.trim();
	const comments = card.comments
		.map((comment) =>
			comment.id === commentId ? { ...comment, bodyMarkdown: trimmed, updatedAt: now() } : comment
		)
		.filter((comment) => comment.bodyMarkdown.length > 0);

	await saveComments(card, comments);
}

export async function deleteComment(cardId: string, commentId: string) {
	const card = await db.cards.get(cardId);
	if (!card) return;

	await saveComments(
		card,
		card.comments.filter((comment) => comment.id !== commentId)
	);
}

async function saveComments(card: CardRecord, comments: CardComment[]) {
	await db.transaction('rw', db.cards, db.boards, async () => {
		const timestamp = now();
		await db.cards.update(card.id, { comments, updatedAt: timestamp });
		await db.boards.update(card.boardId, { updatedAt: timestamp });
	});
}

export async function setDefaultTemplate(boardId: string, templateId: string) {
	const template = await db.templates.get(templateId);
	if (!template || template.boardId !== boardId) return;

	await db.boards.update(boardId, {
		defaultTemplateId: templateId,
		updatedAt: now()
	});
}

export async function createTemplate(boardId: string, name: string) {
	const timestamp = now();
	const template: CardTemplateRecord = {
		...createBlankTemplateRecord(boardId, timestamp),
		name: name.trim() || 'Untitled template'
	};

	await db.transaction('rw', db.templates, db.boards, async () => {
		await db.templates.add(template);
		await db.boards.update(boardId, { updatedAt: timestamp });
	});

	return template;
}

export async function updateTemplate(
	templateId: string,
	changes: Partial<
		Pick<
			CardTemplateRecord,
			| 'name'
			| 'descriptionMarkdown'
			| 'labelIds'
			| 'dates'
			| 'checklists'
			| 'customFields'
			| 'customFieldOrder'
		>
	>
) {
	const template = await db.templates.get(templateId);
	if (!template) return;

	const timestamp = now();
	const update: Partial<CardTemplateRecord> = { updatedAt: timestamp };
	if (changes.name !== undefined) update.name = changes.name.trim() || 'Untitled template';
	if (changes.descriptionMarkdown !== undefined)
		update.descriptionMarkdown = changes.descriptionMarkdown;
	if (changes.labelIds !== undefined) update.labelIds = changes.labelIds;
	if (changes.dates !== undefined) update.dates = changes.dates;
	if (changes.checklists !== undefined) update.checklists = changes.checklists;
	if (changes.customFields !== undefined) update.customFields = changes.customFields;
	if (changes.customFieldOrder !== undefined) update.customFieldOrder = changes.customFieldOrder;

	await db.transaction('rw', db.templates, db.cards, db.boards, async () => {
		await db.templates.update(templateId, update);
		if (isTemplateStructureUpdate(changes)) {
			const nextTemplate = normalizeTemplateRecord({ ...template, ...update });
			const linkedCards = (await db.cards.where('boardId').equals(template.boardId).toArray())
				.map(normalizeCardRecord)
				.filter((card) => card.templateId === templateId && card.templateState === 'linked');
			await db.cards.bulkPut(
				linkedCards.map((card) => applyTemplateStructureToLinkedCard(card, nextTemplate, timestamp))
			);
		}
		await db.boards.update(template.boardId, { updatedAt: timestamp });
	});
}

export async function deleteTemplate(templateId: string) {
	const template = await db.templates.get(templateId);
	if (!template || template.name === 'Blank') return;

	await db.transaction('rw', db.templates, db.cards, db.boards, async () => {
		const board = await db.boards.get(template.boardId);
		const fallback = await db.templates
			.where('boardId')
			.equals(template.boardId)
			.filter((item) => item.id !== templateId)
			.first();
		const timestamp = now();

		await db.templates.delete(templateId);
		const cards = await db.cards.where('boardId').equals(template.boardId).toArray();
		await db.cards.bulkPut(
			cards
				.filter((card) => card.templateId === templateId)
				.map((card) => ({
					...normalizeCardRecord(card),
					templateId: null,
					templateState: 'custom',
					updatedAt: timestamp
				}))
		);
		await db.boards.update(template.boardId, {
			defaultTemplateId:
				board?.defaultTemplateId === templateId ? (fallback?.id ?? null) : board?.defaultTemplateId,
			updatedAt: timestamp
		});
	});
}

export async function applyTemplate(cardId: string, templateId: string) {
	const [card, template] = await Promise.all([db.cards.get(cardId), db.templates.get(templateId)]);
	if (!card || !template || card.boardId !== template.boardId) return;

	const timestamp = now();
	await db.transaction('rw', db.cards, db.boards, async () => {
		await db.cards.put(applyTemplateToCard(card, template, timestamp));
		await db.boards.update(card.boardId, { updatedAt: timestamp });
	});
}

export async function saveCardAsTemplate(cardId: string, name: string) {
	const card = await db.cards.get(cardId);
	if (!card) return null;

	const normalizedCard = normalizeCardRecord(card);
	const timestamp = now();
	const template = createTemplateFromCard(normalizedCard, name, timestamp);

	await db.transaction('rw', db.templates, db.cards, db.boards, async () => {
		await db.templates.add(template);
		await db.cards.update(cardId, {
			templateId: template.id,
			templateState: 'linked',
			updatedAt: timestamp
		});
		await db.boards.update(normalizedCard.boardId, { updatedAt: timestamp });
	});

	return template;
}

export async function createCustomField(
	boardId: string,
	name: string,
	type: CustomFieldType,
	options: CustomFieldOption[],
	showOnCard: boolean,
	index: number
) {
	const timestamp = now();
	const field: CustomFieldDefinition = {
		id: nanoid(),
		boardId,
		name: name.trim() || 'Untitled field',
		type,
		options,
		showOnCard,
		position: spacedPosition(index),
		createdAt: timestamp,
		updatedAt: timestamp
	};

	await db.transaction('rw', db.customFields, db.boards, async () => {
		await db.customFields.add(field);
		await db.boards.update(boardId, { updatedAt: timestamp });
	});

	return field;
}

export async function updateCustomField(
	fieldId: string,
	changes: Partial<Pick<CustomFieldDefinition, 'name' | 'type' | 'options' | 'showOnCard'>>
) {
	const field = await db.customFields.get(fieldId);
	if (!field) return;

	const nextField = {
		...field,
		...changes,
		name: changes.name?.trim() || field.name,
		updatedAt: now()
	};

	await db.transaction('rw', db.customFields, db.cards, db.templates, db.boards, async () => {
		await db.customFields.put(nextField);
		await normalizeFieldReferences(nextField);
		await db.boards.update(field.boardId, { updatedAt: nextField.updatedAt });
	});
}

export async function deleteCustomField(fieldId: string) {
	const field = await db.customFields.get(fieldId);
	if (!field) return;

	await db.transaction('rw', db.customFields, db.cards, db.templates, db.boards, async () => {
		const timestamp = now();
		const [cards, templates] = await Promise.all([
			db.cards.where('boardId').equals(field.boardId).toArray(),
			db.templates.where('boardId').equals(field.boardId).toArray()
		]);

		await db.customFields.delete(fieldId);
		await db.cards.bulkPut(
			removeCustomFieldValues(cards, fieldId).map((card) => ({ ...card, updatedAt: timestamp }))
		);
		await db.templates.bulkPut(
			removeCustomFieldValues(templates, fieldId).map((template) => ({
				...template,
				updatedAt: timestamp
			}))
		);
		await db.boards.update(field.boardId, { updatedAt: timestamp });
	});
}

export async function createLabel(boardId: string, name: string, color?: string) {
	const timestamp = now();
	const existingLabels = normalizeLabelRecords(
		await db.labels.where('boardId').equals(boardId).toArray()
	);
	const label: LabelRecord = {
		id: nanoid(),
		boardId,
		name: name.trim(),
		color: color ?? localdeckLabelColors[0],
		position: nextPosition(existingLabels),
		createdAt: timestamp,
		updatedAt: timestamp
	};

	await db.transaction('rw', db.labels, db.boards, async () => {
		await db.labels.add(label);
		await db.boards.update(boardId, { updatedAt: timestamp });
	});

	return label;
}

export async function reorderLabels(boardId: string, labels: LabelRecord[]) {
	const timestamp = now();
	const updates = normalizePositions(labels).map((label) => ({ ...label, updatedAt: timestamp }));

	await db.transaction('rw', db.labels, db.boards, async () => {
		await db.labels.bulkPut(updates);
		await db.boards.update(boardId, { updatedAt: timestamp });
	});

	return updates;
}

export async function updateLabel(
	labelId: string,
	changes: Partial<Pick<LabelRecord, 'name' | 'color'>>
) {
	const label = await db.labels.get(labelId);
	if (!label) return;

	const timestamp = now();
	await db.transaction('rw', db.labels, db.boards, async () => {
		await db.labels.update(labelId, {
			name: changes.name?.trim() ?? label.name,
			color: changes.color ?? label.color,
			updatedAt: timestamp
		});
		await db.boards.update(label.boardId, { updatedAt: timestamp });
	});
}

export async function deleteLabel(labelId: string) {
	const label = await db.labels.get(labelId);
	if (!label) return;

	await db.transaction('rw', db.labels, db.cards, db.templates, db.boards, async () => {
		const timestamp = now();
		const [cards, templates] = await Promise.all([
			db.cards.where('boardId').equals(label.boardId).toArray(),
			db.templates.where('boardId').equals(label.boardId).toArray()
		]);

		await db.labels.delete(labelId);
		await db.cards.bulkPut(
			removeLabelReferences(cards, labelId).map((card) => ({ ...card, updatedAt: timestamp }))
		);
		await db.templates.bulkPut(
			removeLabelReferences(templates, labelId).map((template) => ({
				...template,
				updatedAt: timestamp
			}))
		);
		await db.boards.update(label.boardId, { updatedAt: timestamp });
	});
}

export function createDateEntry(
	type: CardDateEntry['type'],
	date: string,
	label = ''
): CardDateEntry {
	return { id: nanoid(), type, date, label };
}

export function createCustomFieldOption(name: string): CustomFieldOption {
	return createModelCustomFieldOption(name);
}

export function labelColors() {
	return localdeckLabelColors;
}

function boardRecordFromArchive(payload: BoardArchivePayload): BoardRecord {
	return {
		id: payload.board.id,
		name: payload.board.name,
		defaultTemplateId: payload.board.defaultTemplateId,
		createdAt: payload.board.createdAt,
		updatedAt: payload.board.updatedAt
	};
}

async function assertNoChildIdConflicts(
	payload: BoardArchivePayload,
	replacingBoardId: string | null
) {
	const conflicts = [
		...(await conflictingIds(payload.stacks, async (id) => db.stacks.get(id), replacingBoardId)),
		...(await conflictingIds(payload.cards, async (id) => db.cards.get(id), replacingBoardId)),
		...(await conflictingIds(
			payload.templates,
			async (id) => db.templates.get(id),
			replacingBoardId
		)),
		...(await conflictingIds(
			payload.customFields,
			async (id) => db.customFields.get(id),
			replacingBoardId
		)),
		...(await conflictingIds(payload.labels, async (id) => db.labels.get(id), replacingBoardId))
	];

	if (conflicts.length > 0) {
		throw new Error(`Import failed because record IDs already exist: ${conflicts.join(', ')}.`);
	}
}

async function conflictingIds<T extends { id: string; boardId: string }>(
	records: T[],
	find: (id: string) => Promise<T | undefined>,
	replacingBoardId: string | null
) {
	const conflicts: string[] = [];
	for (const record of records) {
		const existing = await find(record.id);
		if (existing && existing.boardId !== replacingBoardId) conflicts.push(record.id);
	}
	return conflicts;
}

async function collidingIdMap<T extends { id: string }>(
	records: T[],
	find: (id: string) => Promise<unknown>
) {
	const idMap = new Map<string, string>();
	for (const record of records) {
		if (await find(record.id)) idMap.set(record.id, nanoid());
	}
	return idMap;
}

function remapNullableId(id: string | null, idMap: Map<string, string>) {
	return id ? (idMap.get(id) ?? id) : null;
}

function remapCustomFields(
	customFields: Record<string, CustomFieldValue>,
	fieldIdMap: Map<string, string>
) {
	return Object.fromEntries(
		Object.entries(customFields).map(([fieldId, value]) => [
			fieldIdMap.get(fieldId) ?? fieldId,
			value
		])
	);
}

function isTemplateStructureUpdate(
	changes: Partial<
		Pick<
			CardTemplateRecord,
			| 'name'
			| 'descriptionMarkdown'
			| 'labelIds'
			| 'dates'
			| 'checklists'
			| 'customFields'
			| 'customFieldOrder'
		>
	>
) {
	return (
		changes.descriptionMarkdown !== undefined ||
		changes.labelIds !== undefined ||
		changes.dates !== undefined ||
		changes.checklists !== undefined ||
		changes.customFields !== undefined ||
		changes.customFieldOrder !== undefined
	);
}

function nextPosition<T extends { position?: number }>(items: T[]) {
	return items.reduce((position, item) => Math.max(position, item.position ?? 0), 0) + 1000;
}

async function resolveTemplateForBoard(boardId: string, templateId?: string | null) {
	const board = await db.boards.get(boardId);
	const id = templateId === undefined ? board?.defaultTemplateId : templateId;
	if (!id) return null;

	const template = await db.templates.get(id);
	return template?.boardId === boardId ? template : null;
}

async function normalizeFieldReferences(field: CustomFieldDefinition) {
	const [cards, templates] = await Promise.all([
		db.cards.where('boardId').equals(field.boardId).toArray(),
		db.templates.where('boardId').equals(field.boardId).toArray()
	]);

	await db.cards.bulkPut(
		cards.map((card) => ({
			...card,
			customFields:
				field.id in card.customFields
					? {
							...card.customFields,
							[field.id]: normalizeCustomFieldValue(field, card.customFields[field.id])
						}
					: card.customFields,
			updatedAt: field.updatedAt
		}))
	);
	await db.templates.bulkPut(
		templates.map((template) => ({
			...template,
			customFields:
				field.id in template.customFields
					? {
							...template.customFields,
							[field.id]: normalizeCustomFieldValue(field, template.customFields[field.id])
						}
					: template.customFields,
			updatedAt: field.updatedAt
		}))
	);
}
