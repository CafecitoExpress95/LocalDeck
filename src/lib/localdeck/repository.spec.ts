import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from './db';
import {
	addComment,
	createBoard,
	createCard,
	createLabel,
	duplicateCard,
	loadBoard,
	moveCardToStack,
	reorderLabels,
	updateCard
} from './repository';
import type { CardChecklist, CardRecord, LabelRecord } from './types';

describe('LocalDeck card repository operations', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
	});

	afterEach(async () => {
		await db.delete();
		await db.open();
	});

	it('duplicates a card below the source with fresh structured record ids', async () => {
		expect.hasAssertions();

		const board = await createBoard('Duplication board');
		const snapshot = await loadBoard(board.id);
		const stack = snapshot?.stacks[0];
		expect(stack).toBeDefined();

		const source = await createCard(board.id, stack!.id, 'Source card', 0);
		await createCard(board.id, stack!.id, 'Following card', 1);
		const checklist: CardChecklist = {
			id: 'checklist-1',
			name: 'Launch',
			position: 1000,
			createdAt: source.createdAt,
			updatedAt: source.createdAt,
			items: [
				{
					id: 'item-parent',
					label: 'Parent item',
					checked: true,
					parentId: null,
					position: 1000,
					createdAt: source.createdAt,
					updatedAt: source.createdAt
				},
				{
					id: 'item-child',
					label: 'Child item',
					checked: false,
					parentId: 'item-parent',
					position: 2000,
					createdAt: source.createdAt,
					updatedAt: source.createdAt
				}
			]
		};

		await updateCard(source.id, {
			descriptionMarkdown: '## Details',
			labelIds: ['label-1'],
			dates: [{ id: 'date-1', type: 'due', label: 'Due', date: '2026-06-02' }],
			checklists: [checklist],
			customFields: { field1: ['alpha', 'beta'] },
			customFieldOrder: ['field1']
		});
		await addComment(source.id, 'Keep this note');

		const beforeDuplicate = await loadBoard(board.id);
		const sourceBefore = requireCard(beforeDuplicate?.cards, source.id);
		const duplicate = await duplicateCard(source.id);
		const afterDuplicate = await loadBoard(board.id);
		const stackCards = (afterDuplicate?.cards ?? []).filter((card) => card.stackId === stack!.id);
		const sourceAfter = requireCard(stackCards, source.id);
		const copiedCard = requireCard(stackCards, duplicate!.id);

		expect(stackCards.map((card) => card.name)).toEqual([
			'Source card',
			'Source card (Copy)',
			'Following card'
		]);
		expect(copiedCard).toMatchObject({
			boardId: source.boardId,
			stackId: source.stackId,
			descriptionMarkdown: '## Details',
			labelIds: ['label-1'],
			customFields: { field1: ['alpha', 'beta'] },
			customFieldOrder: ['field1']
		});
		expect(copiedCard.id).not.toBe(source.id);
		expect(copiedCard.position).toBeGreaterThan(sourceAfter.position);
		expect(copiedCard.dates[0]).toMatchObject({ type: 'due', label: 'Due', date: '2026-06-02' });
		expect(copiedCard.dates[0].id).not.toBe(sourceAfter.dates[0].id);
		expect(copiedCard.checklists[0].id).not.toBe(sourceAfter.checklists[0].id);
		expect(copiedCard.checklists[0].items[0].id).not.toBe(sourceAfter.checklists[0].items[0].id);
		expect(copiedCard.checklists[0].items[1].parentId).toBe(copiedCard.checklists[0].items[0].id);
		expect(copiedCard.comments[0]).toMatchObject({ bodyMarkdown: 'Keep this note' });
		expect(copiedCard.comments[0].id).not.toBe(sourceAfter.comments[0].id);
		expect(sourceAfter).toEqual(sourceBefore);
	});

	it('moves a card to the bottom of the selected target stack', async () => {
		expect.hasAssertions();

		const board = await createBoard('Move board');
		const snapshot = await loadBoard(board.id);
		const [sourceStack, targetStack] = snapshot!.stacks;
		const source = await createCard(board.id, sourceStack.id, 'Move me', 0);
		await createCard(board.id, targetStack.id, 'Existing target', 0);

		const moved = await moveCardToStack(source.id, targetStack.id);
		const afterMove = await loadBoard(board.id);
		const sourceStackCards = (afterMove?.cards ?? []).filter(
			(card) => card.stackId === sourceStack.id
		);
		const targetStackCards = (afterMove?.cards ?? []).filter(
			(card) => card.stackId === targetStack.id
		);

		expect(moved).toMatchObject({ id: source.id, stackId: targetStack.id });
		expect(sourceStackCards).toHaveLength(0);
		expect(targetStackCards.map((card) => card.name)).toEqual(['Existing target', 'Move me']);
		expect(targetStackCards[1].position).toBeGreaterThan(targetStackCards[0].position);
	});

	it('creates and reorders labels with spaced board-level positions', async () => {
		expect.hasAssertions();

		const board = await createBoard('Label board');
		const first = await createLabel(board.id, 'First label');
		const second = await createLabel(board.id, 'Second label');

		expect(first.position).toBe(1000);
		expect(second.position).toBe(2000);

		await reorderLabels(board.id, [second, first]);
		const snapshot = await loadBoard(board.id);

		expect(snapshot?.labels.map((label) => label.name)).toEqual(['Second label', 'First label']);
		expect(snapshot?.labels.map((label) => label.position)).toEqual([1000, 2000]);
	});

	it('loads legacy labels without positions in creation order', async () => {
		expect.hasAssertions();

		const board = await createBoard('Legacy label board');
		await db.labels.bulkAdd([
			legacyLabel(board.id, 'label-late', 'Late label', '2026-05-16T03:00:00.000Z'),
			legacyLabel(board.id, 'label-early', 'Early label', '2026-05-16T02:00:00.000Z')
		]);

		const snapshot = await loadBoard(board.id);

		expect(snapshot?.labels.map((label) => label.name)).toEqual(['Early label', 'Late label']);
		expect(snapshot?.labels.map((label) => label.position)).toEqual([1000, 2000]);
	});
});

function requireCard(cards: CardRecord[] | undefined, cardId: string) {
	const card = cards?.find((item) => item.id === cardId);
	expect(card).toBeDefined();
	return card!;
}

function legacyLabel(boardId: string, id: string, name: string, timestamp: string): LabelRecord {
	return {
		id,
		boardId,
		name,
		color: '#314bef',
		createdAt: timestamp,
		updatedAt: timestamp
	} as LabelRecord;
}
