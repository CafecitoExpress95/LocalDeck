export const BOARD_ARCHIVE_FORMAT = 'localdeck-board';
export const BOARD_ARCHIVE_FORMAT_VERSION = 1;
export const BOARD_ARCHIVE_APP_NAME = 'LocalDeck';

export const BOARD_ARCHIVE_ROOT_FILES = ['manifest.json', 'board.json'] as const;
export const BOARD_ARCHIVE_FOLDERS = [
	'stacks/',
	'templates/',
	'custom-fields/',
	'labels/',
	'metadata/',
	'attachments/'
] as const;

export const BOARD_ARCHIVE_EXPORT_INFO_PATH = 'metadata/export-info.json';
export const BOARD_ARCHIVE_ATTACHMENTS_README_PATH = 'attachments/README.txt';

export const BOARD_ARCHIVE_ATTACHMENTS_README =
	'Binary attachment packaging is reserved for a future LocalDeck .board format version.\nLocalDeck v0.3 does not store attachment files in this archive.\n';
