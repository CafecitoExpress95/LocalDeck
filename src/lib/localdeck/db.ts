import Dexie, { type Table } from 'dexie';

import { createBlankTemplateRecord } from './model';
import type {
	AppPreference,
	BoardRecord,
	CardRecord,
	CardTemplateRecord,
	CustomFieldDefinition,
	LabelRecord,
	StackRecord
} from './types';

export class LocalDeckDatabase extends Dexie {
	boards!: Table<BoardRecord, string>;
	stacks!: Table<StackRecord, string>;
	cards!: Table<CardRecord, string>;
	templates!: Table<CardTemplateRecord, string>;
	customFields!: Table<CustomFieldDefinition, string>;
	labels!: Table<LabelRecord, string>;
	preferences!: Table<AppPreference, string>;

	constructor() {
		super('localdeck-v01');

		this.version(1).stores({
			boards: '&id, updatedAt',
			stacks: '&id, boardId, [boardId+position]',
			cards: '&id, boardId, stackId, [stackId+position]',
			preferences: '&key'
		});

		this.version(2)
			.stores({
				boards: '&id, updatedAt',
				stacks: '&id, boardId, [boardId+position]',
				cards: '&id, boardId, stackId, [stackId+position]',
				templates: '&id, boardId, [boardId+updatedAt]',
				customFields: '&id, boardId, [boardId+position]',
				labels: '&id, boardId',
				preferences: '&key'
			})
			.upgrade(async (transaction) => {
				const boards = await transaction.table<BoardRecord, string>('boards').toArray();

				for (const board of boards) {
					const timestamp = board.updatedAt;
					const template = createBlankTemplateRecord(board.id, timestamp);
					await transaction.table<CardTemplateRecord, string>('templates').add(template);
					await transaction.table<BoardRecord, string>('boards').update(board.id, {
						defaultTemplateId: template.id
					});
				}

				const cards = await transaction.table<CardRecord, string>('cards').toArray();
				for (const card of cards) {
					await transaction.table<CardRecord, string>('cards').update(card.id, {
						templateId: null,
						labelIds: [],
						dates: [],
						customFields: {},
						customFieldOrder: [],
						templateState: 'custom'
					});
				}
			});

		this.version(3)
			.stores({
				boards: '&id, updatedAt',
				stacks: '&id, boardId, [boardId+position]',
				cards: '&id, boardId, stackId, [stackId+position]',
				templates: '&id, boardId, [boardId+updatedAt]',
				customFields: '&id, boardId, [boardId+position]',
				labels: '&id, boardId',
				preferences: '&key'
			})
			.upgrade(async (transaction) => {
				const templates = await transaction
					.table<CardTemplateRecord, string>('templates')
					.toArray();
				for (const template of templates) {
					await transaction.table<CardTemplateRecord, string>('templates').update(template.id, {
						customFieldOrder: Object.keys(template.customFields ?? {})
					});
				}

				const cards = await transaction.table<CardRecord, string>('cards').toArray();
				for (const card of cards) {
					await transaction.table<CardRecord, string>('cards').update(card.id, {
						customFieldOrder: Object.keys(card.customFields ?? {}),
						templateState: card.templateId ? 'linked' : 'custom'
					});
				}
			});

		this.version(4)
			.stores({
				boards: '&id, updatedAt',
				stacks: '&id, boardId, [boardId+position]',
				cards: '&id, boardId, stackId, [stackId+position]',
				templates: '&id, boardId, [boardId+updatedAt]',
				customFields: '&id, boardId, [boardId+position]',
				labels: '&id, boardId',
				preferences: '&key'
			})
			.upgrade(async (transaction) => {
				const templates = await transaction
					.table<CardTemplateRecord, string>('templates')
					.toArray();
				for (const template of templates) {
					await transaction.table<CardTemplateRecord, string>('templates').update(template.id, {
						checklists: []
					});
				}

				const cards = await transaction.table<CardRecord, string>('cards').toArray();
				for (const card of cards) {
					await transaction.table<CardRecord, string>('cards').update(card.id, {
						checklists: []
					});
				}
			});

		this.version(5)
			.stores({
				boards: '&id, updatedAt',
				stacks: '&id, boardId, [boardId+position]',
				cards: '&id, boardId, stackId, [stackId+position]',
				templates: '&id, boardId, [boardId+updatedAt]',
				customFields: '&id, boardId, [boardId+position]',
				labels: '&id, boardId, [boardId+position]',
				preferences: '&key'
			})
			.upgrade(async (transaction) => {
				const labels = await transaction.table<LabelRecord, string>('labels').toArray();
				const labelsByBoard = new Map<string, LabelRecord[]>();

				for (const label of labels) {
					const boardLabels = labelsByBoard.get(label.boardId) ?? [];
					boardLabels.push(label);
					labelsByBoard.set(label.boardId, boardLabels);
				}

				for (const boardLabels of labelsByBoard.values()) {
					const ordered = boardLabels.sort(
						(left, right) =>
							left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
					);
					for (const [index, label] of ordered.entries()) {
						await transaction.table<LabelRecord, string>('labels').update(label.id, {
							position: (index + 1) * 1000
						});
					}
				}
			});
	}
}

export const db = new LocalDeckDatabase();
