import { strToU8, zipSync } from 'fflate';

import {
	BOARD_ARCHIVE_APP_NAME,
	BOARD_ARCHIVE_ATTACHMENTS_README,
	BOARD_ARCHIVE_ATTACHMENTS_README_PATH,
	BOARD_ARCHIVE_EXPORT_INFO_PATH,
	BOARD_ARCHIVE_FOLDERS,
	BOARD_ARCHIVE_FORMAT,
	BOARD_ARCHIVE_FORMAT_VERSION
} from './boardArchiveConstants';
import type {
	BoardArchiveBoardFile,
	BoardArchiveExportInfo,
	BoardArchiveExportResult,
	BoardArchiveManifest
} from './boardArchiveTypes';
import type {
	BoardSnapshot,
	CardRecord,
	CardTemplateRecord,
	CustomFieldDefinition,
	LabelRecord,
	StackRecord
} from '../types';

const encoderOptions = { level: 6 as const };

export function exportBoardArchive(
	snapshot: BoardSnapshot,
	appVersion: string,
	exportedAt = new Date().toISOString()
): BoardArchiveExportResult {
	const files: Record<string, Uint8Array> = {};
	for (const folder of BOARD_ARCHIVE_FOLDERS) files[folder] = new Uint8Array();

	const stacks = [...snapshot.stacks].sort(byPosition);
	const cards = [...snapshot.cards].sort(byPosition);
	const templates = [...snapshot.templates].sort(byCreated);
	const customFields = [...snapshot.customFields].sort(byPosition);
	const labels = [...snapshot.labels].sort(byCreated);

	const boardFile: BoardArchiveBoardFile = {
		...snapshot.board,
		stackOrder: stacks.map((stack) => stack.id)
	};
	const manifest: BoardArchiveManifest = {
		format: BOARD_ARCHIVE_FORMAT,
		formatVersion: BOARD_ARCHIVE_FORMAT_VERSION,
		appName: BOARD_ARCHIVE_APP_NAME,
		appVersion,
		createdAt: exportedAt,
		exportedAt,
		boardId: snapshot.board.id,
		boardName: snapshot.board.name,
		encrypted: false
	};
	const exportInfo: BoardArchiveExportInfo = {
		exportedAt,
		appName: BOARD_ARCHIVE_APP_NAME,
		appVersion,
		formatVersion: BOARD_ARCHIVE_FORMAT_VERSION,
		boardId: snapshot.board.id,
		boardName: snapshot.board.name
	};

	files['manifest.json'] = jsonBytes(manifest);
	files['board.json'] = jsonBytes(boardFile);
	files[BOARD_ARCHIVE_EXPORT_INFO_PATH] = jsonBytes(exportInfo);
	files[BOARD_ARCHIVE_ATTACHMENTS_README_PATH] = strToU8(BOARD_ARCHIVE_ATTACHMENTS_README);

	for (const [stackIndex, stack] of stacks.entries()) {
		const stackFolder = `stacks/${readableName(stackIndex, stack.name || stack.id)}/`;
		files[stackFolder] = new Uint8Array();
		files[`${stackFolder}stack.json`] = jsonBytes(stack);
		files[`${stackFolder}cards/`] = new Uint8Array();

		const stackCards = cards.filter((card) => card.stackId === stack.id).sort(byPosition);
		for (const [cardIndex, card] of stackCards.entries()) {
			const cardFolder = `${stackFolder}cards/${readableName(cardIndex, card.name || card.id)}/`;
			files[cardFolder] = new Uint8Array();
			files[`${cardFolder}card.json`] = jsonBytes(card);
		}
	}

	const templateNames = new Set<string>();
	for (const template of templates) {
		files[
			`templates/${readableFileName(template.name || template.id, template.id, templateNames)}.json`
		] = jsonBytes(template);
	}
	const fieldNames = new Set<string>();
	for (const field of customFields) {
		files[`custom-fields/${readableFileName(field.name || field.id, field.id, fieldNames)}.json`] =
			jsonBytes(field);
	}
	const labelNames = new Set<string>();
	for (const label of labels) {
		files[`labels/${readableFileName(label.name || label.id, label.id, labelNames)}.json`] =
			jsonBytes(label);
	}

	const zipBytes = zipSync(files, encoderOptions);
	return {
		blob: new Blob([zipBytes], { type: 'application/zip' }),
		filename: `${safeDownloadName(snapshot.board.name)}.board`
	};
}

function jsonBytes(value: unknown) {
	return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function byPosition<T extends { position: number; createdAt: string; id: string }>(
	left: T,
	right: T
) {
	return (
		left.position - right.position ||
		left.createdAt.localeCompare(right.createdAt) ||
		left.id.localeCompare(right.id)
	);
}

function byCreated<
	T extends CardTemplateRecord | CustomFieldDefinition | LabelRecord | StackRecord | CardRecord
>(left: T, right: T) {
	return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function readableName(index: number, value: string) {
	return `${String(index + 1).padStart(3, '0')}_${slug(value)}`;
}

function readableFileName(value: string, id: string, used: Set<string>) {
	const base = slug(value);
	const unique = used.has(base) ? `${base}_${slug(id)}` : base;
	used.add(unique);
	return unique;
}

function safeDownloadName(value: string) {
	return slug(value, 'localdeck-board');
}

function slug(value: string, fallback = 'untitled') {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[/\\:*?"<>|]+/g, '-')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');

	return normalized || fallback;
}
