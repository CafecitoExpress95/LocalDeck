import type {
	BoardRecord,
	CardRecord,
	CardTemplateRecord,
	CustomFieldDefinition,
	LabelRecord,
	StackRecord
} from '../types';

export type BoardArchiveManifest = {
	format: 'localdeck-board';
	formatVersion: 1;
	appName: 'LocalDeck';
	appVersion: string;
	createdAt: string;
	exportedAt: string;
	boardId: string;
	boardName: string;
	encrypted: false;
};

export type BoardArchiveBoardFile = BoardRecord & {
	stackOrder?: string[];
};

export type BoardArchiveExportInfo = {
	exportedAt: string;
	appName: 'LocalDeck';
	appVersion: string;
	formatVersion: 1;
	boardId: string;
	boardName: string;
};

export type BoardArchivePayload = {
	manifest: BoardArchiveManifest;
	board: BoardArchiveBoardFile;
	stacks: StackRecord[];
	cards: CardRecord[];
	templates: CardTemplateRecord[];
	customFields: CustomFieldDefinition[];
	labels: LabelRecord[];
	exportInfo?: BoardArchiveExportInfo;
};

export type BoardArchiveValidationIssue = {
	path?: string;
	message: string;
};

export type BoardArchiveValidationResult =
	| {
			valid: true;
			payload: BoardArchivePayload;
			warnings: BoardArchiveValidationIssue[];
	  }
	| {
			valid: false;
			errors: BoardArchiveValidationIssue[];
			warnings: BoardArchiveValidationIssue[];
	  };

export type BoardArchiveExportResult = {
	blob: Blob;
	filename: string;
};

export type BoardArchiveImportConflict = 'none' | 'existing-board';

export type PreparedBoardArchiveImport = {
	payload: BoardArchivePayload;
	warnings: BoardArchiveValidationIssue[];
	conflict: BoardArchiveImportConflict;
};

export type BoardArchiveImportMode = 'new' | 'replace' | 'copy';
