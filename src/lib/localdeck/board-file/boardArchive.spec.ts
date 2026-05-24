import 'fake-indexeddb/auto';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import { db } from '../db';
import { importBoardSnapshot, loadBoard } from '../repository';
import type {
	BoardSnapshot,
	CardRecord,
	CardTemplateRecord,
	CustomFieldDefinition,
	LabelRecord,
	StackRecord
} from '../types';
import { exportBoardArchive } from './exportBoardArchive';
import { validateBoardArchive } from './validateBoardArchive';

const timestamp = '2026-05-16T02:30:00.000Z';

describe('LocalDeck .board archives', () => {
	afterEach(async () => {
		await db.delete();
		await db.open();
	});

	it('exports a folder-based one-board archive without aggregate object arrays', async () => {
		expect.hasAssertions();

		const snapshot = createSnapshot();
		const archive = await exportedFiles(snapshot);
		const cardJson = JSON.parse(
			strFromU8(archive['stacks/001_backlog/cards/001_create-exporter/card.json'])
		) as CardRecord;

		expect(Object.keys(archive)).toEqual(
			expect.arrayContaining([
				'manifest.json',
				'board.json',
				'stacks/',
				'stacks/001_backlog/',
				'stacks/001_backlog/stack.json',
				'stacks/001_backlog/cards/',
				'stacks/001_backlog/cards/001_create-exporter/',
				'stacks/001_backlog/cards/001_create-exporter/card.json',
				'templates/blank.json',
				'custom-fields/priority.json',
				'labels/backend.json',
				'metadata/export-info.json',
				'attachments/README.txt'
			])
		);
		expect(Object.keys(archive)).not.toEqual(
			expect.arrayContaining([
				'cards.json',
				'stacks.json',
				'templates.json',
				'custom-fields.json',
				'labels.json',
				'comments.json'
			])
		);
		expect(strFromU8(archive['manifest.json'])).toContain('\n  "format": "localdeck-board"');
		expect(cardJson.descriptionMarkdown).toBe('## Ship it\n- [ ] Validate archive');
		expect(cardJson.comments).toHaveLength(1);
		expect(cardJson.checklists[0]).toMatchObject({
			id: 'checklist-release',
			name: 'Release checklist'
		});
		expect(cardJson.checklists[0].items[1]).toMatchObject({
			id: 'checklist-release-child',
			parentId: 'checklist-release-parent'
		});
		expect(JSON.parse(strFromU8(archive['labels/backend.json']))).toMatchObject({
			id: 'label-backend',
			position: 1000
		});
	});

	it('validates archive references and warning-level physical card placement mismatches', async () => {
		expect.hasAssertions();

		const snapshot = createSnapshot();
		const archive = await exportedFiles(snapshot);
		const misplacedArchive = { ...archive };
		misplacedArchive['stacks/002_doing/cards/001_create-exporter/'] = new Uint8Array();
		misplacedArchive['stacks/002_doing/cards/001_create-exporter/card.json'] =
			archive['stacks/001_backlog/cards/001_create-exporter/card.json'];
		delete misplacedArchive['stacks/001_backlog/cards/001_create-exporter/'];
		delete misplacedArchive['stacks/001_backlog/cards/001_create-exporter/card.json'];

		const result = validateBoardArchive(zipSync(misplacedArchive));

		expect(result.valid).toBe(true);
		expect(result.warnings[0]?.message).toContain('LocalDeck used card.json.stackId');
		if (result.valid) {
			expect(result.payload.cards[0].stackId).toBe('stack-backlog');
		}
	});

	it('rejects invalid archives before producing an import payload', () => {
		expect.hasAssertions();

		const result = validateBoardArchive(
			zipSync({
				'board.json': strToU8('{}'),
				'stacks/': new Uint8Array(),
				'templates/': new Uint8Array(),
				'custom-fields/': new Uint8Array(),
				'labels/': new Uint8Array(),
				'metadata/': new Uint8Array(),
				'attachments/': new Uint8Array()
			})
		);

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors[0]?.message).toBe('Import failed because manifest.json is missing.');
		}
	});

	it('imports a validated archive into IndexedDB as an all-or-nothing board snapshot', async () => {
		expect.hasAssertions();

		const snapshot = createSnapshot();
		const validation = validateBoardArchive(await exportedBytes(snapshot));
		expect(validation.valid).toBe(true);
		if (!validation.valid) return;

		const board = await importBoardSnapshot(validation.payload, 'new');
		const loaded = await loadBoard(board.id);

		expect(loaded?.board.name).toBe(snapshot.board.name);
		expect(loaded?.stacks.map((stack) => stack.name)).toEqual(['Backlog', 'Doing']);
		expect(loaded?.cards[0]).toMatchObject({
			id: 'card-exporter',
			stackId: 'stack-backlog',
			descriptionMarkdown: '## Ship it\n- [ ] Validate archive',
			checklists: snapshot.cards[0].checklists
		});
		expect(loaded?.cards[0].comments[0].bodyMarkdown).toBe('Raw **Markdown** comment');
	});

	it('rejects malformed checklist data before import', async () => {
		expect.hasAssertions();

		const snapshot = createSnapshot();
		const archive = await exportedFiles(snapshot);
		const card = JSON.parse(
			strFromU8(archive['stacks/001_backlog/cards/001_create-exporter/card.json'])
		) as CardRecord;
		card.checklists[0].items[1].parentId = 'missing-item';
		archive['stacks/001_backlog/cards/001_create-exporter/card.json'] = strToU8(
			JSON.stringify(card, null, 2)
		);

		const result = validateBoardArchive(zipSync(archive));

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors.map((error) => error.message).join('\n')).toContain(
				'parentId references missing checklist item missing-item'
			);
		}
	});

	it('normalizes legacy label archives with missing positions', async () => {
		expect.hasAssertions();

		const snapshot = createSnapshot();
		const archive = await exportedFiles(snapshot);
		const label = JSON.parse(strFromU8(archive['labels/backend.json'])) as Partial<LabelRecord>;
		delete label.position;
		archive['labels/backend.json'] = strToU8(JSON.stringify(label, null, 2));

		const result = validateBoardArchive(zipSync(archive));

		expect(result.valid).toBe(true);
		expect(result.warnings.map((warning) => warning.message).join('\n')).toContain(
			'missing position'
		);
		if (result.valid) {
			expect(result.payload.labels[0]).toMatchObject({ id: 'label-backend', position: 1000 });
		}
	});

	it('rejects label archives with invalid positions', async () => {
		expect.hasAssertions();

		const snapshot = createSnapshot();
		const archive = await exportedFiles(snapshot);
		const label = JSON.parse(strFromU8(archive['labels/backend.json'])) as Record<string, unknown>;
		label.position = 'first';
		archive['labels/backend.json'] = strToU8(JSON.stringify(label, null, 2));

		const result = validateBoardArchive(zipSync(archive));

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors.map((error) => error.message).join('\n')).toContain(
				'label position must be a number'
			);
		}
	});

	it('imports the same archive as a copy without reusing colliding child IDs', async () => {
		expect.hasAssertions();

		const snapshot = createSnapshot();
		const validation = validateBoardArchive(await exportedBytes(snapshot));
		expect(validation.valid).toBe(true);
		if (!validation.valid) return;

		await importBoardSnapshot(validation.payload, 'new');
		const copy = await importBoardSnapshot(validation.payload, 'copy');
		const loadedCopy = await loadBoard(copy.id);

		expect(copy.id).not.toBe(snapshot.board.id);
		expect(copy.name).toBe('Board File Test copy');
		expect(loadedCopy?.stacks[0].id).not.toBe('stack-backlog');
		expect(loadedCopy?.cards[0].id).not.toBe('card-exporter');
		expect(loadedCopy?.cards[0].stackId).toBe(loadedCopy?.stacks[0].id);
		expect(loadedCopy?.cards[0].labelIds).toEqual([loadedCopy?.labels[0].id]);
	});
});

async function exportedBytes(snapshot: BoardSnapshot) {
	return new Uint8Array(
		await exportBoardArchive(snapshot, '0.3.0', '2026-05-16T03:00:00.000Z').blob.arrayBuffer()
	);
}

async function exportedFiles(snapshot: BoardSnapshot) {
	return unzipSync(await exportedBytes(snapshot));
}

function createSnapshot(): BoardSnapshot {
	const board = {
		id: 'board-1',
		name: 'Board File Test',
		defaultTemplateId: 'template-blank',
		createdAt: timestamp,
		updatedAt: timestamp
	};
	const stacks: StackRecord[] = [
		createStack('stack-backlog', 'Backlog', 1000),
		createStack('stack-doing', 'Doing', 2000)
	];
	const labels: LabelRecord[] = [
		{
			id: 'label-backend',
			boardId: board.id,
			name: 'Backend',
			color: '#314bef',
			position: 1000,
			createdAt: timestamp,
			updatedAt: timestamp
		}
	];
	const customFields: CustomFieldDefinition[] = [
		{
			id: 'field-priority',
			boardId: board.id,
			name: 'Priority',
			type: 'select',
			options: [
				{ id: 'p1', name: 'P1' },
				{ id: 'p2', name: 'P2' }
			],
			showOnCard: true,
			position: 1000,
			createdAt: timestamp,
			updatedAt: timestamp
		}
	];
	const templates: CardTemplateRecord[] = [
		{
			id: 'template-blank',
			boardId: board.id,
			name: 'Blank',
			descriptionMarkdown: '',
			labelIds: [],
			dates: [],
			checklists: [],
			customFields: {},
			customFieldOrder: [],
			createdAt: timestamp,
			updatedAt: timestamp
		}
	];
	const cards: CardRecord[] = [
		{
			id: 'card-exporter',
			boardId: board.id,
			stackId: 'stack-backlog',
			name: 'Create exporter',
			templateId: 'template-blank',
			templateState: 'custom',
			descriptionMarkdown: '## Ship it\n- [ ] Validate archive',
			labelIds: ['label-backend'],
			dates: [{ id: 'date-due', type: 'due', label: 'Due', date: '2026-05-20' }],
			checklists: [
				{
					id: 'checklist-release',
					name: 'Release checklist',
					items: [
						{
							id: 'checklist-release-parent',
							label: 'Validate archive',
							checked: true,
							parentId: null,
							position: 1000,
							createdAt: timestamp,
							updatedAt: timestamp
						},
						{
							id: 'checklist-release-child',
							label: 'Import copy',
							checked: false,
							parentId: 'checklist-release-parent',
							position: 2000,
							createdAt: timestamp,
							updatedAt: timestamp
						}
					],
					position: 1000,
					createdAt: timestamp,
					updatedAt: timestamp
				}
			],
			customFields: { 'field-priority': 'p1' },
			customFieldOrder: ['field-priority'],
			comments: [
				{
					id: 'comment-1',
					createdAt: timestamp,
					updatedAt: timestamp,
					bodyMarkdown: 'Raw **Markdown** comment'
				}
			],
			position: 1000,
			createdAt: timestamp,
			updatedAt: timestamp
		}
	];

	return { board, stacks, cards, templates, customFields, labels };
}

function createStack(id: string, name: string, position: number): StackRecord {
	return {
		id,
		boardId: 'board-1',
		name,
		position,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}
