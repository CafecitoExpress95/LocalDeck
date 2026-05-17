import { boardExists } from '../repository';
import type { BoardArchiveValidationResult, PreparedBoardArchiveImport } from './boardArchiveTypes';
import { validateBoardArchive } from './validateBoardArchive';

export async function prepareBoardArchiveImport(
	input: File | Blob | ArrayBuffer | Uint8Array
): Promise<PreparedBoardArchiveImport | BoardArchiveValidationResult> {
	const bytes = await toArchiveBytes(input);
	const validation = validateBoardArchive(bytes);
	if (!validation.valid) return validation;

	return {
		payload: validation.payload,
		warnings: validation.warnings,
		conflict: (await boardExists(validation.payload.board.id)) ? 'existing-board' : 'none'
	};
}

async function toArchiveBytes(input: File | Blob | ArrayBuffer | Uint8Array) {
	if (input instanceof Uint8Array) return input;
	if (input instanceof ArrayBuffer) return new Uint8Array(input);
	return new Uint8Array(await input.arrayBuffer());
}
