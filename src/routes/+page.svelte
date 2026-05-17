<script lang="ts">
	import { onMount } from 'svelte';
	import { dndzone } from 'svelte-dnd-action';
	import {
		ArrowLeft,
		ArrowDown,
		ArrowUp,
		CalendarDays,
		Check,
		Columns3,
		Download,
		FileArchive,
		LayoutDashboard,
		MessageSquare,
		Minus,
		PanelTop,
		Plus,
		Settings2,
		Tag,
		Trash2,
		Upload,
		X
	} from 'lucide-svelte';

	import packageJson from '../../package.json';
	import { exportBoardArchive } from '$lib/localdeck/board-file/exportBoardArchive';
	import { prepareBoardArchiveImport } from '$lib/localdeck/board-file/importBoardArchive';
	import type {
		BoardArchivePayload,
		BoardArchiveValidationIssue,
		PreparedBoardArchiveImport
	} from '$lib/localdeck/board-file/boardArchiveTypes';
	import {
		customFieldInputValue,
		emptyCustomFieldValue,
		normalizeCustomFieldValue,
		normalizeExplicitCustomFields,
		parseOptionsDraft
	} from '$lib/localdeck/model';
	import { renderMarkdown } from '$lib/localdeck/markdown';
	import {
		addComment,
		applyTemplate,
		createBoard,
		createCard,
		createCustomField,
		createDateEntry,
		createLabel,
		createStack,
		createTemplate,
		deleteBoard,
		deleteCard,
		deleteComment,
		deleteCustomField,
		deleteLabel,
		deleteStack,
		deleteTemplate,
		getLastBoardId,
		importBoardSnapshot,
		labelColors,
		listBoards,
		loadBoard,
		renameBoard,
		renameStack,
		reorderCards,
		reorderStacks,
		saveCardAsTemplate,
		setDefaultTemplate,
		setLastBoardId,
		updateCard,
		updateComment,
		updateCustomField,
		updateLabel,
		updateTemplate
	} from '$lib/localdeck/repository';
	import type {
		BoardRecord,
		CardComment,
		CardDateEntry,
		CardRecord,
		CardTemplateRecord,
		CardTemplateState,
		CustomFieldDefinition,
		CustomFieldType,
		CustomFieldValue,
		LabelRecord,
		StackRecord
	} from '$lib/localdeck/types';

	type FieldDraft = {
		name: string;
		type: CustomFieldType;
		optionsDraft: string;
		showOnCard: boolean;
	};

	type LabelDraft = {
		name: string;
		color: string;
	};

	type BoardFileMessage = {
		type: 'success' | 'error' | 'warning';
		text: string;
		warnings: BoardArchiveValidationIssue[];
	};

	const appVersion = packageJson.version;
	const availableLabelColors = labelColors();
	const fieldTypes: { value: CustomFieldType; label: string }[] = [
		{ value: 'text', label: 'Text' },
		{ value: 'multiline', label: 'Multi-line Text' },
		{ value: 'number', label: 'Number' },
		{ value: 'checkbox', label: 'Checkbox' },
		{ value: 'select', label: 'Dropdown' },
		{ value: 'multiselect', label: 'Multi-select' },
		{ value: 'date', label: 'Date' },
		{ value: 'url', label: 'URL' }
	];
	const dateTypes: { value: CardDateEntry['type']; label: string }[] = [
		{ value: 'start', label: 'Start' },
		{ value: 'due', label: 'Due' },
		{ value: 'milestone', label: 'Milestone' },
		{ value: 'custom', label: 'Custom' }
	];

	let loading = true;
	let boards: BoardRecord[] = [];
	let currentBoard: BoardRecord | null = null;
	let stacks: StackRecord[] = [];
	let cards: CardRecord[] = [];
	let templates: CardTemplateRecord[] = [];
	let customFields: CustomFieldDefinition[] = [];
	let labels: LabelRecord[] = [];
	let selectedCardId: string | null = null;
	let boardView: 'board' | 'templates' = 'board';

	let newBoardName = '';
	let newStackName = '';
	let cardDrafts: Record<string, string> = {};
	let stackNameDrafts: Record<string, string> = {};
	let boardNameDraft = '';
	let boardFileInput: HTMLInputElement | null = null;
	let boardFileMessage: BoardFileMessage | null = null;
	let importingBoardFile = false;
	let pendingBoardImport: PreparedBoardArchiveImport | null = null;

	let cardNameDraft = '';
	let cardDescriptionDraft = '';
	let cardTemplateDraft: string | null = null;
	let cardTemplateStateDraft: CardTemplateState = 'custom';
	let cardLabelIdsDraft: string[] = [];
	let cardDatesDraft: CardDateEntry[] = [];
	let cardCustomFieldsDraft: Record<string, CustomFieldValue> = {};
	let cardCustomFieldOrderDraft: string[] = [];
	let editingDescription = false;
	let commentDraft = '';
	let editingCommentId: string | null = null;
	let editingCommentDraft = '';
	let newCardDateType: CardDateEntry['type'] = 'due';
	let newCardDateDate = '';
	let newCardDateLabel = '';
	let cardFieldToAddId = '';
	let saveTemplateNameDraft = '';

	let templateChooserStackId: string | null = null;
	let selectedTemplateId: string | null = null;
	let newTemplateName = '';
	let templateNameDraft = '';
	let templateDescriptionDraft = '';
	let templateLabelIdsDraft: string[] = [];
	let templateDatesDraft: CardDateEntry[] = [];
	let templateCustomFieldsDraft: Record<string, CustomFieldValue> = {};
	let templateCustomFieldOrderDraft: string[] = [];
	let newTemplateDateType: CardDateEntry['type'] = 'due';
	let newTemplateDateDate = '';
	let newTemplateDateLabel = '';
	let templateFieldToAddId = '';

	let newFieldName = '';
	let newFieldType: CustomFieldType = 'text';
	let newFieldOptionsDraft = '';
	let newFieldShowOnCard = true;
	let fieldDrafts: Record<string, FieldDraft> = {};

	let newLabelName = '';
	let newLabelColor = availableLabelColors[0];
	let labelDrafts: Record<string, LabelDraft> = {};

	$: selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;
	$: selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
	$: selectedCardTemplate = templates.find((template) => template.id === cardTemplateDraft) ?? null;
	$: cardTemplateStatusLabel =
		cardTemplateStateDraft === 'linked' && selectedCardTemplate
			? `Linked to ${selectedCardTemplate.name}`
			: 'Custom';
	$: labelMap = new Map(labels.map((label) => [label.id, label]));
	$: customFieldMap = new Map(customFields.map((field) => [field.id, field]));
	$: cardsByStack = stacks.reduce<Record<string, CardRecord[]>>((grouped, stack) => {
		grouped[stack.id] = cards
			.filter((card) => card.stackId === stack.id)
			.sort(
				(left, right) =>
					left.position - right.position || left.createdAt.localeCompare(right.createdAt)
			);
		return grouped;
	}, {});
	$: cardCount = cards.length;
	$: commentCount = cards.reduce((total, card) => total + card.comments.length, 0);
	$: visibleFields = customFields.filter((field) => field.showOnCard);
	$: cardCustomFieldDefinitions = customFields.filter((field) =>
		hasCustomField(cardCustomFieldsDraft, field.id)
	);
	$: orderedCardCustomFieldDefinitions = orderedFieldsForDraft(
		cardCustomFieldDefinitions,
		cardCustomFieldOrderDraft
	);
	$: cardAvailableCustomFields = customFields.filter(
		(field) => !hasCustomField(cardCustomFieldsDraft, field.id)
	);
	$: templateCustomFieldDefinitions = customFields.filter((field) =>
		hasCustomField(templateCustomFieldsDraft, field.id)
	);
	$: orderedTemplateCustomFieldDefinitions = orderedFieldsForDraft(
		templateCustomFieldDefinitions,
		templateCustomFieldOrderDraft
	);
	$: templateAvailableCustomFields = customFields.filter(
		(field) => !hasCustomField(templateCustomFieldsDraft, field.id)
	);

	onMount(async () => {
		try {
			await refreshBoards();
			const lastBoardId = await getLastBoardId();
			const boardToOpen =
				lastBoardId && boards.some((board) => board.id === lastBoardId) ? lastBoardId : null;

			if (boardToOpen) {
				await openBoard(boardToOpen);
			}
		} catch (error) {
			setBoardFileMessage(
				'error',
				persistenceErrorText(error, 'LocalDeck could not finish loading.')
			);
		} finally {
			loading = false;
		}
	});

	async function refreshBoards() {
		boards = await listBoards();
	}

	async function handleCreateBoard() {
		await persistAction(async () => {
			const board = await createBoard(newBoardName);
			newBoardName = '';
			await refreshBoards();
			await openBoard(board.id);
		}, 'Board creation failed.');
	}

	async function handleOpenBoard(boardId: string) {
		await persistAction(async () => openBoard(boardId), 'Board loading failed.', null);
	}

	async function openBoard(boardId: string) {
		const snapshot = await loadBoard(boardId);

		if (!snapshot) {
			await setLastBoardId(null);
			clearBoardState();
			await refreshBoards();
			return;
		}

		currentBoard = snapshot.board;
		boardNameDraft = snapshot.board.name;
		stacks = snapshot.stacks;
		cards = snapshot.cards;
		templates = snapshot.templates;
		customFields = snapshot.customFields;
		labels = snapshot.labels;
		stackNameDrafts = Object.fromEntries(snapshot.stacks.map((stack) => [stack.id, stack.name]));
		cardDrafts = Object.fromEntries(snapshot.stacks.map((stack) => [stack.id, '']));
		fieldDrafts = Object.fromEntries(
			snapshot.customFields.map((field) => [field.id, fieldToDraft(field)])
		);
		labelDrafts = Object.fromEntries(
			snapshot.labels.map((label) => [label.id, { name: label.name, color: label.color }])
		);
		selectedCardId = null;
		selectedTemplateId = snapshot.templates[0]?.id ?? null;
		if (selectedTemplate) syncTemplateDrafts(selectedTemplate);
		await setLastBoardId(boardId);
	}

	function clearBoardState() {
		currentBoard = null;
		stacks = [];
		cards = [];
		templates = [];
		customFields = [];
		labels = [];
		selectedCardId = null;
		selectedTemplateId = null;
		boardView = 'board';
	}

	async function showDashboard() {
		clearBoardState();
		await persistAction(async () => refreshBoards(), 'Dashboard refresh failed.', null);
	}

	async function reloadCurrentBoard(cardIdToKeepOpen: string | null = null) {
		if (!currentBoard) return;

		const snapshot = await loadBoard(currentBoard.id);
		if (!snapshot) return;

		currentBoard = snapshot.board;
		stacks = snapshot.stacks;
		cards = snapshot.cards;
		templates = snapshot.templates;
		customFields = snapshot.customFields;
		labels = snapshot.labels;
		stackNameDrafts = Object.fromEntries(snapshot.stacks.map((stack) => [stack.id, stack.name]));
		fieldDrafts = Object.fromEntries(
			snapshot.customFields.map((field) => [field.id, fieldToDraft(field)])
		);
		labelDrafts = Object.fromEntries(
			snapshot.labels.map((label) => [label.id, { name: label.name, color: label.color }])
		);
		selectedCardId = cardIdToKeepOpen;

		const card = snapshot.cards.find((item) => item.id === cardIdToKeepOpen);
		if (card) syncCardDrafts(card);

		if (
			selectedTemplateId &&
			!snapshot.templates.some((template) => template.id === selectedTemplateId)
		) {
			selectedTemplateId = snapshot.templates[0]?.id ?? null;
		}
		const template = snapshot.templates.find((item) => item.id === selectedTemplateId);
		if (template) syncTemplateDrafts(template);
	}

	function persistenceErrorText(error: unknown, fallback: string) {
		const detail = error instanceof Error ? error.message : '';
		return detail ? `${fallback} ${detail}` : fallback;
	}

	async function recoverAfterPersistenceFailure(cardIdToKeepOpen: string | null = selectedCardId) {
		try {
			if (currentBoard) {
				await reloadCurrentBoard(cardIdToKeepOpen);
			} else {
				await refreshBoards();
			}
		} catch {
			clearBoardState();
			try {
				await refreshBoards();
			} catch {
				boards = [];
			}
		}
	}

	async function persistAction<T>(
		action: () => Promise<T>,
		failureMessage = 'LocalDeck could not save that change.',
		cardIdToKeepOpen: string | null = selectedCardId
	): Promise<T | undefined> {
		try {
			return await action();
		} catch (error) {
			setBoardFileMessage('error', persistenceErrorText(error, failureMessage));
			await recoverAfterPersistenceFailure(cardIdToKeepOpen);
			return undefined;
		}
	}

	async function handleRenameBoard() {
		if (!currentBoard) return;
		const boardId = currentBoard.id;
		await persistAction(async () => {
			await renameBoard(boardId, boardNameDraft);
			await openBoard(boardId);
			await refreshBoards();
		}, 'Board rename failed.');
	}

	async function handleDeleteBoard(boardId: string) {
		const board = boards.find((item) => item.id === boardId);
		if (!board || !confirm(`Delete "${board.name}" and all of its cards?`)) return;

		await persistAction(async () => {
			await deleteBoard(boardId);
			if (currentBoard?.id === boardId) {
				clearBoardState();
			}
			await refreshBoards();
		}, 'Board deletion failed.');
	}

	async function handleExportBoard() {
		if (!currentBoard) return;
		const boardId = currentBoard.id;

		await persistAction(
			async () => {
				const snapshot = await loadBoard(boardId);
				if (!snapshot) {
					setBoardFileMessage(
						'error',
						'Export failed because the active board could not be loaded.'
					);
					return;
				}

				const { blob, filename } = exportBoardArchive(snapshot, appVersion);
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = filename;
				link.click();
				URL.revokeObjectURL(url);
				setBoardFileMessage('success', `Exported ${filename}.`);
			},
			'Export failed.',
			selectedCardId
		);
	}

	function handleImportBoardClick() {
		boardFileInput?.click();
	}

	async function handleBoardFileSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		importingBoardFile = true;
		pendingBoardImport = null;
		boardFileMessage = null;

		try {
			const result = await prepareBoardArchiveImport(file);
			if ('valid' in result) {
				if (!result.valid) {
					setBoardFileMessage(
						'error',
						result.errors[0]?.message ?? 'Import failed because the archive is invalid.',
						result.warnings
					);
				}
				return;
			}

			if (result.conflict === 'existing-board') {
				pendingBoardImport = result;
				setBoardFileMessage(
					'warning',
					`"${result.payload.board.name}" already exists. Choose how to import it.`,
					result.warnings
				);
				return;
			}

			await commitBoardImport(result.payload, 'new', result.warnings);
		} catch (error) {
			setBoardFileMessage('error', error instanceof Error ? error.message : 'Import failed.');
		} finally {
			importingBoardFile = false;
		}
	}

	async function handlePendingBoardImport(mode: 'replace' | 'copy' | 'cancel') {
		if (!pendingBoardImport) return;
		if (mode === 'cancel') {
			pendingBoardImport = null;
			setBoardFileMessage('warning', 'Import canceled.');
			return;
		}

		const { payload, warnings } = pendingBoardImport;
		importingBoardFile = true;
		try {
			await commitBoardImport(payload, mode, warnings);
			pendingBoardImport = null;
		} catch (error) {
			setBoardFileMessage(
				'error',
				error instanceof Error ? error.message : 'Import failed.',
				warnings
			);
		} finally {
			importingBoardFile = false;
		}
	}

	async function commitBoardImport(
		payload: BoardArchivePayload,
		mode: 'new' | 'replace' | 'copy',
		warnings: BoardArchiveValidationIssue[]
	) {
		const importedBoard = await importBoardSnapshot(payload, mode);
		await refreshBoards();
		await openBoard(importedBoard.id);
		setBoardFileMessage(
			warnings.length > 0 ? 'warning' : 'success',
			`Imported "${importedBoard.name}".${warningSummary(warnings)}`,
			warnings
		);
	}

	function setBoardFileMessage(
		type: BoardFileMessage['type'],
		text: string,
		warnings: BoardArchiveValidationIssue[] = []
	) {
		boardFileMessage = { type, text, warnings };
	}

	async function handleCreateStack() {
		if (!currentBoard) return;
		const boardId = currentBoard.id;

		await persistAction(async () => {
			const stack = await createStack(boardId, newStackName, stacks.length);
			newStackName = '';
			stacks = [...stacks, stack];
			stackNameDrafts = { ...stackNameDrafts, [stack.id]: stack.name };
			cardDrafts = { ...cardDrafts, [stack.id]: '' };
		}, 'Stack creation failed.');
	}

	async function handleRenameStack(stackId: string) {
		await persistAction(async () => {
			await renameStack(stackId, stackNameDrafts[stackId] ?? '');
			if (currentBoard) await openBoard(currentBoard.id);
		}, 'Stack rename failed.');
	}

	async function handleDeleteStack(stackId: string) {
		const stack = stacks.find((item) => item.id === stackId);
		if (!stack || !confirm(`Delete "${stack.name}" and its cards?`)) return;

		await persistAction(async () => {
			await deleteStack(stackId);
			if (currentBoard) await openBoard(currentBoard.id);
		}, 'Stack deletion failed.');
	}

	async function handleCreateCard(stackId: string, templateId?: string | null) {
		if (!currentBoard) return;
		const boardId = currentBoard.id;

		await persistAction(async () => {
			const stackCards = cardsByStack[stackId] ?? [];
			const card = await createCard(
				boardId,
				stackId,
				cardDrafts[stackId] ?? '',
				stackCards.length,
				templateId
			);
			cards = [...cards, card];
			cardDrafts = { ...cardDrafts, [stackId]: '' };
			templateChooserStackId = null;
		}, 'Card creation failed.');
	}

	function handleCardDraftKeydown(stackId: string, event: KeyboardEvent) {
		if (event.key === 'Enter' && event.ctrlKey) {
			event.preventDefault();
			templateChooserStackId = stackId;
		}
	}

	function openCard(card: CardRecord) {
		selectedCardId = card.id;
		syncCardDrafts(card);
	}

	function syncCardDrafts(card: CardRecord) {
		cardNameDraft = card.name;
		cardDescriptionDraft = card.descriptionMarkdown;
		cardTemplateDraft = card.templateId;
		cardTemplateStateDraft = card.templateState;
		cardLabelIdsDraft = [...card.labelIds];
		cardDatesDraft = card.dates.map((date) => ({ ...date }));
		cardCustomFieldsDraft = { ...card.customFields };
		cardCustomFieldOrderDraft = [...card.customFieldOrder];
		editingDescription = false;
		commentDraft = '';
		editingCommentId = null;
		editingCommentDraft = '';
		newCardDateType = 'due';
		newCardDateDate = '';
		newCardDateLabel = '';
		cardFieldToAddId = '';
		saveTemplateNameDraft = `${card.name} template`;
	}

	function closeCard() {
		selectedCardId = null;
		editingDescription = false;
	}

	async function handleSaveCard(options: { closeAfterSave?: boolean } = {}) {
		if (!selectedCard) return;
		const cardId = selectedCard.id;

		await persistAction(
			async () => {
				await updateCard(cardId, {
					name: cardNameDraft,
					descriptionMarkdown: cardDescriptionDraft,
					templateId: cardTemplateDraft,
					templateState: nextCardTemplateState(),
					labelIds: cardLabelIdsDraft,
					dates: cardDatesDraft,
					customFields: normalizeExplicitCustomFields(customFields, cardCustomFieldsDraft),
					customFieldOrder: orderedExistingFieldIds(
						cardCustomFieldsDraft,
						cardCustomFieldOrderDraft
					)
				});

				await reloadCurrentBoard(options.closeAfterSave ? null : cardId);
				editingDescription = false;

				if (options.closeAfterSave) closeCard();
			},
			'Card save failed.',
			cardId
		);
	}

	async function handleApplyTemplateToCard(templateId: string) {
		if (!selectedCard) return;
		if (!templateId) {
			cardTemplateDraft = null;
			cardTemplateStateDraft = 'custom';
			return;
		}
		if (templateId === selectedCard.templateId) return;

		const template = templates.find((item) => item.id === templateId);
		if (!template) return;

		const confirmed = confirm(
			`Apply "${template.name}" to this card? The card name and comments will be preserved, but labels, dates, description, and custom fields will be replaced.`
		);
		if (!confirmed) {
			cardTemplateDraft = selectedCard.templateId;
			return;
		}

		const cardId = selectedCard.id;
		await persistAction(
			async () => {
				await applyTemplate(cardId, template.id);
				await reloadCurrentBoard(cardId);
			},
			'Template apply failed.',
			cardId
		);
	}

	async function handleSaveCardAsTemplate() {
		if (!selectedCard) return;
		const cardId = selectedCard.id;

		await persistAction(
			async () => {
				await updateCard(cardId, {
					name: cardNameDraft,
					descriptionMarkdown: cardDescriptionDraft,
					templateId: cardTemplateDraft,
					templateState: 'custom',
					labelIds: cardLabelIdsDraft,
					dates: cardDatesDraft,
					customFields: normalizeExplicitCustomFields(customFields, cardCustomFieldsDraft),
					customFieldOrder: orderedExistingFieldIds(
						cardCustomFieldsDraft,
						cardCustomFieldOrderDraft
					)
				});

				const template = await saveCardAsTemplate(cardId, saveTemplateNameDraft || cardNameDraft);
				if (template) selectedTemplateId = template.id;
				await reloadCurrentBoard(cardId);
			},
			'Template save failed.',
			cardId
		);
	}

	async function handleDeleteCard() {
		if (!selectedCard || !confirm(`Delete "${selectedCard.name}"?`)) return;

		const cardId = selectedCard.id;
		await persistAction(
			async () => {
				await deleteCard(cardId);
				await reloadCurrentBoard(null);
				closeCard();
			},
			'Card deletion failed.',
			cardId
		);
	}

	async function handleAddComment() {
		if (!selectedCard || !commentDraft.trim()) return;
		const cardId = selectedCard.id;

		await persistAction(
			async () => {
				await addComment(cardId, commentDraft);
				commentDraft = '';
				await reloadCurrentBoard(cardId);
			},
			'Comment save failed.',
			cardId
		);
	}

	async function handleUpdateComment(comment: CardComment) {
		if (!selectedCard) return;
		const cardId = selectedCard.id;

		await persistAction(
			async () => {
				await updateComment(cardId, comment.id, editingCommentDraft);
				editingCommentId = null;
				editingCommentDraft = '';
				await reloadCurrentBoard(cardId);
			},
			'Comment update failed.',
			cardId
		);
	}

	async function handleDeleteComment(comment: CardComment) {
		if (!selectedCard) return;
		const cardId = selectedCard.id;

		await persistAction(
			async () => {
				await deleteComment(cardId, comment.id);
				await reloadCurrentBoard(cardId);
			},
			'Comment deletion failed.',
			cardId
		);
	}

	async function handleCreateTemplate() {
		if (!currentBoard) return;
		const boardId = currentBoard.id;

		await persistAction(async () => {
			const template = await createTemplate(boardId, newTemplateName);
			newTemplateName = '';
			selectedTemplateId = template.id;
			await reloadCurrentBoard();
		}, 'Template creation failed.');
	}

	async function handleSaveTemplate() {
		if (!selectedTemplate) return;
		const templateId = selectedTemplate.id;

		await persistAction(async () => {
			await updateTemplate(templateId, {
				name: templateNameDraft,
				descriptionMarkdown: templateDescriptionDraft,
				labelIds: templateLabelIdsDraft,
				dates: templateDatesDraft,
				customFields: normalizeExplicitCustomFields(customFields, templateCustomFieldsDraft),
				customFieldOrder: orderedExistingFieldIds(
					templateCustomFieldsDraft,
					templateCustomFieldOrderDraft
				)
			});
			await reloadCurrentBoard(selectedCardId);
		}, 'Template save failed.');
	}

	async function handleDeleteTemplate() {
		if (!selectedTemplate || !confirm(`Delete template "${selectedTemplate.name}"?`)) return;

		const templateId = selectedTemplate.id;
		await persistAction(async () => {
			await deleteTemplate(templateId);
			selectedTemplateId = null;
			await reloadCurrentBoard(selectedCardId);
		}, 'Template deletion failed.');
	}

	async function handleSetDefaultTemplate(templateId: string) {
		if (!currentBoard) return;
		const boardId = currentBoard.id;

		await persistAction(async () => {
			await setDefaultTemplate(boardId, templateId);
			await reloadCurrentBoard(selectedCardId);
		}, 'Default template update failed.');
	}

	function openTemplateEditor(template: CardTemplateRecord) {
		selectedTemplateId = template.id;
		syncTemplateDrafts(template);
	}

	function syncTemplateDrafts(template: CardTemplateRecord) {
		templateNameDraft = template.name;
		templateDescriptionDraft = template.descriptionMarkdown;
		templateLabelIdsDraft = [...template.labelIds];
		templateDatesDraft = template.dates.map((date) => ({ ...date }));
		templateCustomFieldsDraft = { ...template.customFields };
		templateCustomFieldOrderDraft = [...template.customFieldOrder];
		newTemplateDateType = 'due';
		newTemplateDateDate = '';
		newTemplateDateLabel = '';
		templateFieldToAddId = '';
	}

	async function handleCreateField() {
		if (!currentBoard || !newFieldName.trim()) return;
		const boardId = currentBoard.id;

		await persistAction(async () => {
			await createCustomField(
				boardId,
				newFieldName,
				newFieldType,
				parseOptionsDraft(newFieldOptionsDraft),
				newFieldShowOnCard,
				customFields.length
			);
			newFieldName = '';
			newFieldOptionsDraft = '';
			newFieldType = 'text';
			newFieldShowOnCard = true;
			await reloadCurrentBoard(selectedCardId);
		}, 'Custom field creation failed.');
	}

	async function handleSaveField(field: CustomFieldDefinition) {
		const draft = fieldDrafts[field.id];
		if (!draft) return;

		await persistAction(async () => {
			await updateCustomField(field.id, {
				name: draft.name,
				type: draft.type,
				options: parseOptionsDraft(draft.optionsDraft, field),
				showOnCard: draft.showOnCard
			});
			await reloadCurrentBoard(selectedCardId);
		}, 'Custom field save failed.');
	}

	async function handleDeleteField(field: CustomFieldDefinition) {
		if (!confirm(`Delete custom field "${field.name}" from cards and templates?`)) return;

		await persistAction(async () => {
			await deleteCustomField(field.id);
			await reloadCurrentBoard(selectedCardId);
		}, 'Custom field deletion failed.');
	}

	async function handleCreateLabel() {
		if (!currentBoard) return;
		const boardId = currentBoard.id;

		await persistAction(async () => {
			await createLabel(boardId, newLabelName, newLabelColor);
			newLabelName = '';
			newLabelColor = availableLabelColors[0];
			await reloadCurrentBoard(selectedCardId);
		}, 'Label creation failed.');
	}

	async function handleSaveLabel(label: LabelRecord) {
		const draft = labelDrafts[label.id];
		if (!draft) return;

		await persistAction(async () => {
			await updateLabel(label.id, draft);
			await reloadCurrentBoard(selectedCardId);
		}, 'Label save failed.');
	}

	async function handleDeleteLabel(label: LabelRecord) {
		if (!confirm(`Delete label "${label.name || 'Unnamed'}" from cards and templates?`)) return;

		await persistAction(async () => {
			await deleteLabel(label.id);
			await reloadCurrentBoard(selectedCardId);
		}, 'Label deletion failed.');
	}

	function addCardDate() {
		if (!newCardDateDate) return;
		cardDatesDraft = [
			...cardDatesDraft,
			createDateEntry(newCardDateType, newCardDateDate, newCardDateLabel.trim())
		];
		markCardStructureCustom();
		newCardDateDate = '';
		newCardDateLabel = '';
	}

	function addTemplateDate() {
		templateDatesDraft = [
			...templateDatesDraft,
			createDateEntry(newTemplateDateType, newTemplateDateDate, newTemplateDateLabel.trim())
		];
		newTemplateDateDate = '';
		newTemplateDateLabel = '';
	}

	function handleDateLabelKeydown(event: KeyboardEvent, addDate: () => void) {
		if (event.key !== 'Enter') return;

		event.preventDefault();
		addDate();
	}

	function removeCardDate(dateId: string) {
		cardDatesDraft = cardDatesDraft.filter((date) => date.id !== dateId);
		markCardStructureCustom();
	}

	function removeTemplateDate(dateId: string) {
		templateDatesDraft = templateDatesDraft.filter((date) => date.id !== dateId);
	}

	function toggleId(ids: string[], id: string) {
		return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
	}

	function updateDateDraft(
		dates: CardDateEntry[],
		dateId: string,
		changes: Partial<Pick<CardDateEntry, 'type' | 'label' | 'date'>>
	) {
		return dates.map((entry) => (entry.id === dateId ? { ...entry, ...changes } : entry));
	}

	function updateCardCustomField(field: CustomFieldDefinition, value: CustomFieldValue) {
		cardCustomFieldsDraft = {
			...cardCustomFieldsDraft,
			[field.id]: normalizeCustomFieldValue(field, value)
		};
	}

	function updateTemplateCustomField(field: CustomFieldDefinition, value: CustomFieldValue) {
		templateCustomFieldsDraft = {
			...templateCustomFieldsDraft,
			[field.id]: normalizeCustomFieldValue(field, value)
		};
	}

	function addCardCustomField() {
		const field = customFields.find((item) => item.id === cardFieldToAddId);
		if (!field || hasCustomField(cardCustomFieldsDraft, field.id)) return;

		cardCustomFieldsDraft = {
			...cardCustomFieldsDraft,
			[field.id]: emptyCustomFieldValue(field)
		};
		cardCustomFieldOrderDraft = orderedExistingFieldIds(cardCustomFieldsDraft, [
			...cardCustomFieldOrderDraft,
			field.id
		]);
		markCardStructureCustom();
		cardFieldToAddId = '';
	}

	function addTemplateCustomField() {
		const field = customFields.find((item) => item.id === templateFieldToAddId);
		if (!field || hasCustomField(templateCustomFieldsDraft, field.id)) return;

		templateCustomFieldsDraft = {
			...templateCustomFieldsDraft,
			[field.id]: emptyCustomFieldValue(field)
		};
		templateCustomFieldOrderDraft = orderedExistingFieldIds(templateCustomFieldsDraft, [
			...templateCustomFieldOrderDraft,
			field.id
		]);
		templateFieldToAddId = '';
	}

	function removeCardCustomField(fieldId: string) {
		cardCustomFieldsDraft = removeDraftCustomField(cardCustomFieldsDraft, fieldId);
		cardCustomFieldOrderDraft = orderedExistingFieldIds(
			cardCustomFieldsDraft,
			cardCustomFieldOrderDraft
		);
		markCardStructureCustom();
	}

	function removeTemplateCustomField(fieldId: string) {
		templateCustomFieldsDraft = removeDraftCustomField(templateCustomFieldsDraft, fieldId);
		templateCustomFieldOrderDraft = orderedExistingFieldIds(
			templateCustomFieldsDraft,
			templateCustomFieldOrderDraft
		);
	}

	function removeDraftCustomField(values: Record<string, CustomFieldValue>, fieldId: string) {
		const next = { ...values };
		delete next[fieldId];
		return next;
	}

	function hasCustomField(values: Record<string, CustomFieldValue>, fieldId: string) {
		return Object.prototype.hasOwnProperty.call(values, fieldId);
	}

	function markCardStructureCustom() {
		cardTemplateStateDraft = 'custom';
	}

	function nextCardTemplateState() {
		if (!selectedCard) return cardTemplateStateDraft;
		return cardTemplateStateDraft === 'linked' && cardStructureChanged(selectedCard)
			? 'custom'
			: cardTemplateStateDraft;
	}

	function cardStructureChanged(card: CardRecord) {
		return (
			card.descriptionMarkdown !== cardDescriptionDraft ||
			JSON.stringify(card.labelIds) !== JSON.stringify(cardLabelIdsDraft) ||
			JSON.stringify(card.dates) !== JSON.stringify(cardDatesDraft) ||
			JSON.stringify(card.customFieldOrder) !==
				JSON.stringify(orderedExistingFieldIds(cardCustomFieldsDraft, cardCustomFieldOrderDraft)) ||
			JSON.stringify(Object.keys(card.customFields).sort()) !==
				JSON.stringify(Object.keys(cardCustomFieldsDraft).sort())
		);
	}

	function orderedFieldsForDraft(fields: CustomFieldDefinition[], order: string[]) {
		const fieldsById = new Map(fields.map((field) => [field.id, field]));
		return orderedExistingFieldIds(
			Object.fromEntries(fields.map((field) => [field.id, null])),
			order
		)
			.map((fieldId) => fieldsById.get(fieldId))
			.filter((field): field is CustomFieldDefinition => Boolean(field));
	}

	function orderedExistingFieldIds(values: Record<string, CustomFieldValue>, order: string[]) {
		const fieldIds = Object.keys(values);
		const ordered = order.filter(
			(fieldId, index, entries) => fieldIds.includes(fieldId) && entries.indexOf(fieldId) === index
		);
		const missing = fieldIds.filter((fieldId) => !ordered.includes(fieldId));
		return [...ordered, ...missing];
	}

	function moveCardCustomField(fieldId: string, direction: -1 | 1) {
		cardCustomFieldOrderDraft = moveFieldId(
			orderedExistingFieldIds(cardCustomFieldsDraft, cardCustomFieldOrderDraft),
			fieldId,
			direction
		);
		markCardStructureCustom();
	}

	function moveTemplateCustomField(fieldId: string, direction: -1 | 1) {
		templateCustomFieldOrderDraft = moveFieldId(
			orderedExistingFieldIds(templateCustomFieldsDraft, templateCustomFieldOrderDraft),
			fieldId,
			direction
		);
	}

	function moveFieldId(fieldIds: string[], fieldId: string, direction: -1 | 1) {
		const index = fieldIds.indexOf(fieldId);
		const nextIndex = index + direction;
		if (index < 0 || nextIndex < 0 || nextIndex >= fieldIds.length) return fieldIds;

		const next = [...fieldIds];
		[next[index], next[nextIndex]] = [next[nextIndex], next[index]];
		return next;
	}

	function fieldToDraft(field: CustomFieldDefinition): FieldDraft {
		return {
			name: field.name,
			type: field.type,
			optionsDraft: field.options.map((option) => option.name).join('\n'),
			showOnCard: field.showOnCard
		};
	}

	function needsOptions(type: CustomFieldType) {
		return type === 'select' || type === 'multiselect';
	}

	function customFieldDisplay(field: CustomFieldDefinition, value: CustomFieldValue) {
		if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) return '';
		const options = new Map(field.options.map((option) => [option.id, option.name]));
		if (field.type === 'checkbox') return value ? 'Yes' : 'No';
		if (field.type === 'select' && typeof value === 'string') return options.get(value) ?? '';
		if (field.type === 'multiselect' && Array.isArray(value)) {
			return value
				.map((id) => options.get(id))
				.filter(Boolean)
				.join(', ');
		}
		return String(value);
	}

	function visibleCardFields(card: CardRecord) {
		return orderedFieldsForDraft(
			visibleFields.filter((field) => hasCustomField(card.customFields, field.id)),
			card.customFieldOrder
		);
	}

	function cardDateSummary(card: CardRecord) {
		return card.dates
			.filter((date) => date.date && (date.type === 'start' || date.type === 'due'))
			.sort((left, right) => left.date.localeCompare(right.date));
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function formatLocalDate(value: string) {
		if (!value) return '';
		const [year, month, day] = value.split('-').map(Number);
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(new Date(year, month - 1, day));
	}

	function warningSummary(warnings: BoardArchiveValidationIssue[]) {
		if (warnings.length === 0) return '';
		return ` ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`;
	}

	function blurOnEnter(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			(event.currentTarget as HTMLInputElement).blur();
		}
	}

	function dndItems<T>(event: Event) {
		return (event as CustomEvent<{ items: T[] }>).detail.items;
	}

	function handleStackConsider(event: Event) {
		stacks = dndItems<StackRecord>(event);
	}

	async function handleStackFinalize(event: Event) {
		if (!currentBoard) return;
		const boardId = currentBoard.id;
		await persistAction(
			async () => {
				stacks = await reorderStacks(boardId, dndItems<StackRecord>(event));
			},
			'Stack reorder failed.',
			selectedCardId
		);
	}

	function handleCardConsider(stackId: string, event: Event) {
		applyCardDnd(stackId, dndItems<CardRecord>(event));
	}

	async function handleCardFinalize(stackId: string, event: Event) {
		if (!currentBoard) return;
		const boardId = currentBoard.id;
		const nextCards = applyCardDnd(stackId, dndItems<CardRecord>(event));
		await persistAction(
			async () => {
				cards = await reorderCards(boardId, nextCards);
			},
			'Card move failed.',
			selectedCardId
		);
	}

	function applyCardDnd(stackId: string, stackItems: CardRecord[]) {
		const nextStackCards = stackItems.map((card, index) => ({
			...card,
			stackId,
			position: (index + 1) * 1000
		}));
		const movedIds = new Set(nextStackCards.map((card) => card.id));
		const nextCards = [
			...cards.filter((card) => card.stackId !== stackId && !movedIds.has(card.id)),
			...nextStackCards
		];

		cards = nextCards;
		return nextCards;
	}
</script>

<svelte:head>
	<title>LocalDeck</title>
	<meta name="description" content="A local-first Kanban board for fast offline planning." />
</svelte:head>

<input
	bind:this={boardFileInput}
	class="sr-only"
	type="file"
	accept=".board,application/zip"
	onchange={handleBoardFileSelected}
/>

{#if boardFileMessage}
	<aside
		class:error={boardFileMessage.type === 'error'}
		class:warning={boardFileMessage.type === 'warning'}
		class="board-file-status"
	>
		<strong>{boardFileMessage.text}</strong>
		{#if boardFileMessage.warnings.length > 0}
			<ul>
				{#each boardFileMessage.warnings as warning}
					<li>{warning.message}</li>
				{/each}
			</ul>
		{/if}
		<button
			class="icon-button"
			type="button"
			aria-label="Dismiss import message"
			title="Dismiss"
			onclick={() => (boardFileMessage = null)}
		>
			<X size={16} />
		</button>
	</aside>
{/if}

{#if loading}
	<main class="loading-screen">
		<div class="brand-mark">LD</div>
		<p>Opening LocalDeck...</p>
	</main>
{:else if !currentBoard}
	<main class="app-shell dashboard-shell">
		<section class="dashboard-hero">
			<div class="dashboard-brand">
				<img class="dashboard-logo" src="/logo_dark.png" alt="" aria-hidden="true" />
				<div>
					<h1>LocalDeck</h1>
					<p>Kanban. Local. Private. Secure.</p>
				</div>
			</div>
			<form
				class="create-board"
				onsubmit={(event) => (event.preventDefault(), handleCreateBoard())}
			>
				<label for="new-board">New board</label>
				<div class="input-row">
					<input
						id="new-board"
						bind:value={newBoardName}
						placeholder="Product roadmap"
						autocomplete="off"
					/>
					<button class="primary-button" type="submit">
						<Plus size={18} />
						Create
					</button>
				</div>
			</form>
			<div class="dashboard-actions" aria-label="Board file actions">
				<button
					class="secondary-button"
					type="button"
					disabled={importingBoardFile}
					onclick={handleImportBoardClick}
				>
					<Upload size={17} />
					Import .board
				</button>
			</div>
		</section>

		<section class="board-list" aria-label="Boards">
			<div class="section-heading">
				<LayoutDashboard size={20} />
				<h2>Boards</h2>
			</div>

			{#if boards.length === 0}
				<div class="empty-state">
					<PanelTop size={28} />
					<p>No boards yet. Create one to start shaping your workflow.</p>
				</div>
			{:else}
				<div class="board-grid">
					{#each boards as board (board.id)}
						<article class="board-card">
							<button class="board-open" type="button" onclick={() => handleOpenBoard(board.id)}>
								<span>{board.name}</span>
								<small>Updated {formatDate(board.updatedAt)}</small>
							</button>
							<button
								class="icon-button danger"
								type="button"
								aria-label={`Delete ${board.name}`}
								title="Delete board"
								onclick={() => handleDeleteBoard(board.id)}
							>
								<Trash2 size={17} />
							</button>
						</article>
					{/each}
				</div>
			{/if}
		</section>
		<footer class="dashboard-footer">
			<span>Closed Alpha</span>
			<span>Version {appVersion}</span>
			<span>GPL-3.0 license</span>
			<span>Copyright (C) 2026 Anthony Nunez</span>
		</footer>
	</main>
{:else}
	<main class="app-shell board-shell">
		<header class="topbar">
			<button
				class="icon-button"
				type="button"
				aria-label="Dashboard"
				title="Dashboard"
				onclick={showDashboard}
			>
				<ArrowLeft size={19} />
			</button>
			<div class="board-title-group">
				<input
					class="board-title-input"
					aria-label="Board name"
					bind:value={boardNameDraft}
					onblur={handleRenameBoard}
					onkeydown={blurOnEnter}
				/>
				<div class="board-meta">
					{stacks.length} stacks / {cardCount} cards / {templates.length} templates / {customFields.length}
					fields
				</div>
			</div>
			<div class="topbar-actions">
				<button
					class="secondary-button compact"
					type="button"
					disabled={importingBoardFile}
					onclick={handleImportBoardClick}
				>
					<Upload size={16} />
					Import
				</button>
				<button class="secondary-button compact" type="button" onclick={handleExportBoard}>
					<Download size={16} />
					Export .board
				</button>
				<div class="segmented-control" aria-label="Board view">
					<button
						class:active={boardView === 'board'}
						type="button"
						onclick={() => (boardView = 'board')}
					>
						<Columns3 size={16} />
						Board
					</button>
					<button
						class:active={boardView === 'templates'}
						type="button"
						onclick={() => (boardView = 'templates')}
					>
						<Settings2 size={16} />
						Templates & Fields
					</button>
				</div>
				{#if boardView === 'board'}
					<form
						class="add-stack-form"
						onsubmit={(event) => (event.preventDefault(), handleCreateStack())}
					>
						<input bind:value={newStackName} placeholder="New stack" aria-label="New stack name" />
						<button class="primary-button compact" type="submit">
							<Plus size={17} />
							Stack
						</button>
					</form>
				{/if}
			</div>
		</header>

		{#if boardView === 'board'}
			<section
				class="stack-board"
				aria-label="Board stacks"
				use:dndzone={{ items: stacks, flipDurationMs: 130, type: 'stacks' }}
				onconsider={handleStackConsider}
				onfinalize={handleStackFinalize}
			>
				{#each stacks as stack (stack.id)}
					<article class="stack-column">
						<header class="stack-header">
							<input
								class="stack-name-input"
								aria-label="Stack name"
								bind:value={stackNameDrafts[stack.id]}
								onblur={() => handleRenameStack(stack.id)}
								onkeydown={blurOnEnter}
							/>
							<button
								class="icon-button danger"
								type="button"
								aria-label={`Delete ${stack.name}`}
								title="Delete stack"
								onclick={() => handleDeleteStack(stack.id)}
							>
								<Trash2 size={16} />
							</button>
						</header>

						<div
							class="card-list"
							use:dndzone={{
								items: cardsByStack[stack.id] ?? [],
								flipDurationMs: 130,
								type: 'cards'
							}}
							onconsider={(event) => handleCardConsider(stack.id, event)}
							onfinalize={(event) => handleCardFinalize(stack.id, event)}
						>
							{#each cardsByStack[stack.id] ?? [] as card (card.id)}
								<button class="task-card" type="button" onclick={() => openCard(card)}>
									<span class="task-title">{card.name}</span>
									{#if card.labelIds.length > 0}
										<span class="label-strip" aria-label="Labels">
											{#each card.labelIds as labelId}
												{@const label = labelMap.get(labelId)}
												{#if label}
													<span class="label-chip tiny" style={`--label-color: ${label.color}`}>
														{label.name || ' '}
													</span>
												{/if}
											{/each}
										</span>
									{/if}
									{#if cardDateSummary(card).length > 0}
										<span class="card-meta-row">
											{#each cardDateSummary(card) as date (date.id)}
												<span class="date-pill"
													><CalendarDays size={13} />
													{date.label || date.type}: {formatLocalDate(date.date)}</span
												>
											{/each}
										</span>
									{/if}
									{#if visibleCardFields(card).length > 0}
										<span class="field-preview-list">
											{#each visibleCardFields(card) as field (field.id)}
												{@const display = customFieldDisplay(
													field,
													card.customFields[field.id] ?? null
												)}
												{#if display}
													<span><strong>{field.name}</strong> {display}</span>
												{/if}
											{/each}
										</span>
									{/if}
									{#if card.comments.length > 0}
										<span class="comment-pill"
											><MessageSquare size={13} /> {card.comments.length}</span
										>
									{/if}
								</button>
							{/each}
						</div>

						<form
							class="add-card-form"
							onsubmit={(event) => (event.preventDefault(), handleCreateCard(stack.id))}
						>
							<input
								bind:value={cardDrafts[stack.id]}
								placeholder="Add a card"
								aria-label={`Add card to ${stack.name}`}
								onkeydown={(event) => handleCardDraftKeydown(stack.id, event)}
							/>
							<button
								class="icon-button filled"
								type="submit"
								aria-label="Create card"
								title="Create card"
							>
								<Plus size={17} />
							</button>
						</form>
					</article>
				{/each}
			</section>
		{:else}
			<section class="settings-view" aria-label="Templates and fields">
				<div class="settings-column wide">
					<div class="section-heading tight">
						<h2>Templates</h2>
						<select
							aria-label="Default template"
							value={currentBoard.defaultTemplateId ?? ''}
							onchange={(event) =>
								handleSetDefaultTemplate((event.currentTarget as HTMLSelectElement).value)}
						>
							{#each templates as template (template.id)}
								<option value={template.id}>{template.name}</option>
							{/each}
						</select>
					</div>
					<form
						class="input-row"
						onsubmit={(event) => (event.preventDefault(), handleCreateTemplate())}
					>
						<input
							bind:value={newTemplateName}
							placeholder="New template"
							aria-label="New template name"
						/>
						<button class="primary-button compact" type="submit">
							<Plus size={17} />
							Template
						</button>
					</form>
					<div class="template-layout">
						<div class="template-list">
							{#each templates as template (template.id)}
								<button
									class:active={selectedTemplateId === template.id}
									type="button"
									onclick={() => openTemplateEditor(template)}
								>
									<span>{template.name}</span>
									<small
										>{template.id === currentBoard.defaultTemplateId
											? 'Default'
											: 'Template'}</small
									>
								</button>
							{/each}
						</div>
						{#if selectedTemplate}
							<div class="template-editor">
								<div class="field-grid two">
									<label>
										<span>Name</span>
										<input bind:value={templateNameDraft} />
									</label>
									<div class="inline-actions end">
										<button
											class="primary-button compact"
											type="button"
											onclick={handleSaveTemplate}
										>
											<Check size={16} />
											Save
										</button>
										<button
											class="secondary-button danger-secondary compact"
											type="button"
											disabled={selectedTemplate.name === 'Blank'}
											onclick={handleDeleteTemplate}
										>
											<Trash2 size={16} />
											Delete
										</button>
									</div>
								</div>
								<label class="block-field">
									<span>Description Markdown</span>
									<textarea bind:value={templateDescriptionDraft}></textarea>
								</label>
								<div class="mini-section">
									<h3>Labels</h3>
									<div class="chip-picker">
										{#each labels as label (label.id)}
											<button
												class:active={templateLabelIdsDraft.includes(label.id)}
												class="label-toggle"
												style={`--label-color: ${label.color}`}
												type="button"
												onclick={() =>
													(templateLabelIdsDraft = toggleId(templateLabelIdsDraft, label.id))}
											>
												{label.name || 'Unnamed'}
											</button>
										{/each}
									</div>
								</div>
								<div class="mini-section">
									<h3>Dates</h3>
									{#each templateDatesDraft as date (date.id)}
										<div class="date-row">
											<select
												value={date.type}
												onchange={(event) =>
													(templateDatesDraft = updateDateDraft(templateDatesDraft, date.id, {
														type: (event.currentTarget as HTMLSelectElement)
															.value as CardDateEntry['type']
													}))}
											>
												{#each dateTypes as type}
													<option value={type.value}>{type.label}</option>
												{/each}
											</select>
											<input
												value={date.label}
												placeholder="Label"
												oninput={(event) =>
													(templateDatesDraft = updateDateDraft(templateDatesDraft, date.id, {
														label: (event.currentTarget as HTMLInputElement).value
													}))}
											/>
											<input
												type="date"
												value={date.date}
												oninput={(event) =>
													(templateDatesDraft = updateDateDraft(templateDatesDraft, date.id, {
														date: (event.currentTarget as HTMLInputElement).value
													}))}
											/>
											<button
												class="icon-button danger"
												type="button"
												onclick={() => removeTemplateDate(date.id)}
											>
												<X size={15} />
											</button>
										</div>
									{/each}
									<div class="date-row">
										<select bind:value={newTemplateDateType}>
											{#each dateTypes as type}
												<option value={type.value}>{type.label}</option>
											{/each}
										</select>
										<input
											bind:value={newTemplateDateLabel}
											placeholder="Label"
											onkeydown={(event) => handleDateLabelKeydown(event, addTemplateDate)}
										/>
										<input
											bind:value={newTemplateDateDate}
											type="date"
											aria-label="Optional template date"
										/>
										<button class="icon-button filled" type="button" onclick={addTemplateDate}>
											<Plus size={16} />
										</button>
									</div>
								</div>
								<div class="mini-section">
									<h3>Custom Fields</h3>
									{#if templateAvailableCustomFields.length > 0}
										<div class="field-picker-row">
											<select bind:value={templateFieldToAddId} aria-label="Add template field">
												<option value="">Add field</option>
												{#each templateAvailableCustomFields as field (field.id)}
													<option value={field.id}>{field.name}</option>
												{/each}
											</select>
											<button
												class="icon-button filled"
												type="button"
												aria-label="Add field to template"
												title="Add field"
												disabled={!templateFieldToAddId}
												onclick={addTemplateCustomField}
											>
												<Plus size={16} />
											</button>
										</div>
									{/if}
									<div class="field-list">
										{#each orderedTemplateCustomFieldDefinitions as field, fieldIndex (field.id)}
											<div class="custom-field-control">
												<div class="custom-field-heading">
													<span>{field.name}</span>
													<div class="field-order-actions">
														<button
															class="icon-button"
															type="button"
															aria-label={`Move ${field.name} up`}
															title="Move up"
															disabled={fieldIndex === 0}
															onclick={() => moveTemplateCustomField(field.id, -1)}
														>
															<ArrowUp size={15} />
														</button>
														<button
															class="icon-button"
															type="button"
															aria-label={`Move ${field.name} down`}
															title="Move down"
															disabled={fieldIndex ===
																orderedTemplateCustomFieldDefinitions.length - 1}
															onclick={() => moveTemplateCustomField(field.id, 1)}
														>
															<ArrowDown size={15} />
														</button>
														<button
															class="icon-button danger"
															type="button"
															aria-label={`Remove ${field.name} from template`}
															title="Remove from template"
															onclick={() => removeTemplateCustomField(field.id)}
														>
															<Minus size={15} />
														</button>
													</div>
												</div>
												{#if field.type === 'multiline'}
													<textarea
														value={String(templateCustomFieldsDraft[field.id] ?? '')}
														oninput={(event) =>
															updateTemplateCustomField(
																field,
																(event.currentTarget as HTMLTextAreaElement).value
															)}
													></textarea>
												{:else if field.type === 'checkbox'}
													<input
														type="checkbox"
														checked={Boolean(templateCustomFieldsDraft[field.id])}
														onchange={(event) =>
															updateTemplateCustomField(
																field,
																(event.currentTarget as HTMLInputElement).checked
															)}
													/>
												{:else if field.type === 'select'}
													<select
														value={String(templateCustomFieldsDraft[field.id] ?? '')}
														onchange={(event) =>
															updateTemplateCustomField(
																field,
																(event.currentTarget as HTMLSelectElement).value
															)}
													>
														<option value="">None</option>
														{#each field.options as option (option.id)}
															<option value={option.id}>{option.name}</option>
														{/each}
													</select>
												{:else if field.type === 'multiselect'}
													<select
														multiple
														value={templateCustomFieldsDraft[field.id] as string[] | undefined}
														onchange={(event) =>
															updateTemplateCustomField(
																field,
																Array.from(
																	(event.currentTarget as HTMLSelectElement).selectedOptions
																).map((option) => option.value)
															)}
													>
														{#each field.options as option (option.id)}
															<option value={option.id}>{option.name}</option>
														{/each}
													</select>
												{:else}
													<input
														type={field.type === 'number'
															? 'number'
															: field.type === 'date'
																? 'date'
																: field.type === 'url'
																	? 'url'
																	: 'text'}
														value={String(templateCustomFieldsDraft[field.id] ?? '')}
														oninput={(event) =>
															updateTemplateCustomField(
																field,
																customFieldInputValue(
																	field,
																	(event.currentTarget as HTMLInputElement).value
																)
															)}
													/>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div class="settings-column">
					<div class="section-heading tight">
						<h2>Custom Fields</h2>
					</div>
					<form
						class="settings-form"
						onsubmit={(event) => (event.preventDefault(), handleCreateField())}
					>
						<input bind:value={newFieldName} placeholder="Field name" aria-label="Field name" />
						<select bind:value={newFieldType} aria-label="Field type">
							{#each fieldTypes as type}
								<option value={type.value}>{type.label}</option>
							{/each}
						</select>
						{#if needsOptions(newFieldType)}
							<textarea bind:value={newFieldOptionsDraft} placeholder="Options, one per line"
							></textarea>
						{/if}
						<label class="checkbox-row">
							<input type="checkbox" bind:checked={newFieldShowOnCard} />
							<span>Show on cards</span>
						</label>
						<button class="primary-button compact" type="submit">
							<Plus size={17} />
							Field
						</button>
					</form>
					<div class="settings-list">
						{#each customFields as field (field.id)}
							<article class="settings-item">
								<input bind:value={fieldDrafts[field.id].name} aria-label="Field name" />
								<select bind:value={fieldDrafts[field.id].type} aria-label="Field type">
									{#each fieldTypes as type}
										<option value={type.value}>{type.label}</option>
									{/each}
								</select>
								{#if needsOptions(fieldDrafts[field.id].type)}
									<textarea
										bind:value={fieldDrafts[field.id].optionsDraft}
										placeholder="Options, one per line"
									></textarea>
								{/if}
								<label class="checkbox-row">
									<input type="checkbox" bind:checked={fieldDrafts[field.id].showOnCard} />
									<span>Show on cards</span>
								</label>
								<div class="inline-actions">
									<button
										class="secondary-button compact"
										type="button"
										onclick={() => handleSaveField(field)}
									>
										<Check size={15} />
										Save
									</button>
									<button
										class="icon-button danger"
										type="button"
										onclick={() => handleDeleteField(field)}
									>
										<Trash2 size={15} />
									</button>
								</div>
							</article>
						{/each}
					</div>
				</div>

				<div class="settings-column">
					<div class="section-heading tight">
						<h2>Labels</h2>
					</div>
					<form
						class="settings-form"
						onsubmit={(event) => (event.preventDefault(), handleCreateLabel())}
					>
						<input bind:value={newLabelName} placeholder="Label name" aria-label="Label name" />
						<div class="swatches">
							{#each availableLabelColors as color}
								<button
									class:active={newLabelColor === color}
									style={`--label-color: ${color}`}
									type="button"
									aria-label={`Use ${color}`}
									onclick={() => (newLabelColor = color)}
								></button>
							{/each}
						</div>
						<button class="primary-button compact" type="submit">
							<Plus size={17} />
							Label
						</button>
					</form>
					<div class="settings-list">
						{#each labels as label (label.id)}
							<article class="settings-item">
								<input bind:value={labelDrafts[label.id].name} placeholder="Unnamed label" />
								<div class="swatches">
									{#each availableLabelColors as color}
										<button
											class:active={labelDrafts[label.id].color === color}
											style={`--label-color: ${color}`}
											type="button"
											aria-label={`Use ${color}`}
											onclick={() => (labelDrafts[label.id].color = color)}
										></button>
									{/each}
								</div>
								<div class="inline-actions">
									<button
										class="secondary-button compact"
										type="button"
										onclick={() => handleSaveLabel(label)}
									>
										<Check size={15} />
										Save
									</button>
									<button
										class="icon-button danger"
										type="button"
										onclick={() => handleDeleteLabel(label)}
									>
										<Trash2 size={15} />
									</button>
								</div>
							</article>
						{/each}
					</div>
				</div>
			</section>
		{/if}
	</main>
{/if}

{#if templateChooserStackId}
	<button
		class="modal-backdrop"
		type="button"
		aria-label="Close template chooser"
		onclick={() => (templateChooserStackId = null)}
	></button>
	<aside class="chooser-dialog" aria-label="Choose template">
		<header class="dialog-header">
			<div>
				<div class="eyebrow">Template</div>
				<h2>Create card from template</h2>
			</div>
			<button
				class="icon-button"
				type="button"
				aria-label="Close"
				onclick={() => (templateChooserStackId = null)}
			>
				<X size={19} />
			</button>
		</header>
		<div class="chooser-list">
			{#each templates as template (template.id)}
				<button
					type="button"
					onclick={() => handleCreateCard(templateChooserStackId!, template.id)}
				>
					<span>{template.name}</span>
					<small
						>{template.descriptionMarkdown ? 'Includes description' : 'Blank description'}</small
					>
				</button>
			{/each}
		</div>
	</aside>
{/if}

{#if pendingBoardImport}
	<button
		class="modal-backdrop"
		type="button"
		aria-label="Cancel board import"
		onclick={() => handlePendingBoardImport('cancel')}
	></button>
	<aside class="chooser-dialog conflict-dialog" aria-label="Import conflict">
		<header class="dialog-header">
			<div>
				<div class="eyebrow">Import</div>
				<h2>{pendingBoardImport.payload.board.name}</h2>
			</div>
			<FileArchive size={24} />
		</header>
		<div class="conflict-body">
			<p>A board with this ID already exists.</p>
			{#if pendingBoardImport.warnings.length > 0}
				<ul>
					{#each pendingBoardImport.warnings as warning}
						<li>{warning.message}</li>
					{/each}
				</ul>
			{/if}
		</div>
		<footer class="dialog-footer conflict-actions">
			<button
				class="secondary-button"
				type="button"
				disabled={importingBoardFile}
				onclick={() => handlePendingBoardImport('cancel')}
			>
				Cancel
			</button>
			<button
				class="secondary-button"
				type="button"
				disabled={importingBoardFile}
				onclick={() => handlePendingBoardImport('copy')}
			>
				Import as copy
			</button>
			<button
				class="primary-button"
				type="button"
				disabled={importingBoardFile}
				onclick={() => handlePendingBoardImport('replace')}
			>
				Replace existing
			</button>
		</footer>
	</aside>
{/if}

{#if selectedCard}
	<button class="modal-backdrop" type="button" aria-label="Close card dialog" onclick={closeCard}
	></button>
	<aside class="card-dialog" aria-label="Card dialog">
		<header class="dialog-header">
			<div>
				<div class="eyebrow">Card</div>
				<input class="card-title-input" bind:value={cardNameDraft} aria-label="Card name" />
			</div>
			<button
				class="icon-button"
				type="button"
				aria-label="Close card"
				title="Close"
				onclick={closeCard}
			>
				<X size={19} />
			</button>
		</header>

		<div class="dialog-scroll">
			<section class="dialog-section">
				<div class="section-heading tight">
					<h2>Template</h2>
				</div>
				<select
					bind:value={cardTemplateDraft}
					aria-label="Card template"
					onchange={(event) =>
						handleApplyTemplateToCard((event.currentTarget as HTMLSelectElement).value)}
				>
					<option value="">No template</option>
					{#each templates as template (template.id)}
						<option value={template.id}>{template.name}</option>
					{/each}
				</select>
				<div class="template-status-row">
					<span class:custom-state={cardTemplateStateDraft === 'custom'}
						>{cardTemplateStatusLabel}</span
					>
					{#if cardTemplateStateDraft === 'custom'}
						<div class="save-template-row">
							<input
								bind:value={saveTemplateNameDraft}
								aria-label="New template name"
								placeholder="New template name"
							/>
							<button
								class="secondary-button compact"
								type="button"
								onclick={handleSaveCardAsTemplate}
							>
								<Check size={16} />
								Save as template
							</button>
						</div>
					{/if}
				</div>
			</section>

			<section class="dialog-section">
				<div class="section-heading tight">
					<h2>Labels</h2>
					<Tag size={17} />
				</div>
				<div class="chip-picker">
					{#each labels as label (label.id)}
						<button
							class:active={cardLabelIdsDraft.includes(label.id)}
							class="label-toggle"
							style={`--label-color: ${label.color}`}
							type="button"
							onclick={() => {
								cardLabelIdsDraft = toggleId(cardLabelIdsDraft, label.id);
								markCardStructureCustom();
							}}
						>
							{label.name || 'Unnamed'}
						</button>
					{/each}
				</div>
			</section>

			<section class="dialog-section">
				<div class="section-heading tight">
					<h2>Dates</h2>
					<CalendarDays size={17} />
				</div>
				{#each cardDatesDraft as date (date.id)}
					<div class="date-row">
						<select
							value={date.type}
							onchange={(event) => {
								cardDatesDraft = updateDateDraft(cardDatesDraft, date.id, {
									type: (event.currentTarget as HTMLSelectElement).value as CardDateEntry['type']
								});
								markCardStructureCustom();
							}}
						>
							{#each dateTypes as type}
								<option value={type.value}>{type.label}</option>
							{/each}
						</select>
						<input
							value={date.label}
							placeholder="Label"
							oninput={(event) => {
								cardDatesDraft = updateDateDraft(cardDatesDraft, date.id, {
									label: (event.currentTarget as HTMLInputElement).value
								});
								markCardStructureCustom();
							}}
						/>
						<input
							type="date"
							value={date.date}
							oninput={(event) => {
								cardDatesDraft = updateDateDraft(cardDatesDraft, date.id, {
									date: (event.currentTarget as HTMLInputElement).value
								});
								markCardStructureCustom();
							}}
						/>
						<button
							class="icon-button danger"
							type="button"
							onclick={() => removeCardDate(date.id)}
						>
							<X size={15} />
						</button>
					</div>
				{/each}
				<div class="date-row">
					<select bind:value={newCardDateType}>
						{#each dateTypes as type}
							<option value={type.value}>{type.label}</option>
						{/each}
					</select>
					<input
						bind:value={newCardDateLabel}
						placeholder="Label"
						onkeydown={(event) => handleDateLabelKeydown(event, addCardDate)}
					/>
					<input bind:value={newCardDateDate} type="date" />
					<button class="icon-button filled" type="button" onclick={addCardDate}>
						<Plus size={16} />
					</button>
				</div>
			</section>

			<section class="dialog-section">
				<div class="section-heading tight">
					<h2>Custom Fields</h2>
				</div>
				{#if cardAvailableCustomFields.length > 0}
					<div class="field-picker-row">
						<select bind:value={cardFieldToAddId} aria-label="Add card field">
							<option value="">Add field</option>
							{#each cardAvailableCustomFields as field (field.id)}
								<option value={field.id}>{field.name}</option>
							{/each}
						</select>
						<button
							class="icon-button filled"
							type="button"
							aria-label="Add field to card"
							title="Add field"
							disabled={!cardFieldToAddId}
							onclick={addCardCustomField}
						>
							<Plus size={16} />
						</button>
					</div>
				{/if}
				<div class="field-list">
					{#each orderedCardCustomFieldDefinitions as field, fieldIndex (field.id)}
						<div class="custom-field-control">
							<div class="custom-field-heading">
								<span>{field.name}</span>
								<div class="field-order-actions">
									<button
										class="icon-button"
										type="button"
										aria-label={`Move ${field.name} up`}
										title="Move up"
										disabled={fieldIndex === 0}
										onclick={() => moveCardCustomField(field.id, -1)}
									>
										<ArrowUp size={15} />
									</button>
									<button
										class="icon-button"
										type="button"
										aria-label={`Move ${field.name} down`}
										title="Move down"
										disabled={fieldIndex === orderedCardCustomFieldDefinitions.length - 1}
										onclick={() => moveCardCustomField(field.id, 1)}
									>
										<ArrowDown size={15} />
									</button>
									<button
										class="icon-button danger"
										type="button"
										aria-label={`Remove ${field.name} from card`}
										title="Remove from card"
										onclick={() => removeCardCustomField(field.id)}
									>
										<Minus size={15} />
									</button>
								</div>
							</div>
							{#if field.type === 'multiline'}
								<textarea
									value={String(cardCustomFieldsDraft[field.id] ?? '')}
									oninput={(event) =>
										updateCardCustomField(
											field,
											(event.currentTarget as HTMLTextAreaElement).value
										)}
								></textarea>
							{:else if field.type === 'checkbox'}
								<input
									type="checkbox"
									checked={Boolean(cardCustomFieldsDraft[field.id])}
									onchange={(event) =>
										updateCardCustomField(field, (event.currentTarget as HTMLInputElement).checked)}
								/>
							{:else if field.type === 'select'}
								<select
									value={String(cardCustomFieldsDraft[field.id] ?? '')}
									onchange={(event) =>
										updateCardCustomField(field, (event.currentTarget as HTMLSelectElement).value)}
								>
									<option value="">None</option>
									{#each field.options as option (option.id)}
										<option value={option.id}>{option.name}</option>
									{/each}
								</select>
							{:else if field.type === 'multiselect'}
								<select
									multiple
									value={cardCustomFieldsDraft[field.id] as string[] | undefined}
									onchange={(event) =>
										updateCardCustomField(
											field,
											Array.from((event.currentTarget as HTMLSelectElement).selectedOptions).map(
												(option) => option.value
											)
										)}
								>
									{#each field.options as option (option.id)}
										<option value={option.id}>{option.name}</option>
									{/each}
								</select>
							{:else}
								<input
									type={field.type === 'number'
										? 'number'
										: field.type === 'date'
											? 'date'
											: field.type === 'url'
												? 'url'
												: 'text'}
									value={String(cardCustomFieldsDraft[field.id] ?? '')}
									oninput={(event) =>
										updateCardCustomField(
											field,
											customFieldInputValue(field, (event.currentTarget as HTMLInputElement).value)
										)}
								/>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<section class="dialog-section">
				<div class="section-heading tight">
					<h2>Description</h2>
					{#if editingDescription}
						<button class="primary-button compact" type="button" onclick={() => handleSaveCard()}>
							<Check size={17} />
							Save
						</button>
					{:else}
						<button
							class="secondary-button compact"
							type="button"
							onclick={() => (editingDescription = true)}
						>
							Edit
						</button>
					{/if}
				</div>
				{#if editingDescription}
					<textarea
						class="markdown-editor"
						bind:value={cardDescriptionDraft}
						placeholder="Write Markdown notes for this card."
						oninput={markCardStructureCustom}
					></textarea>
					<div class="markdown-preview">
						<!-- svelte-ignore svelte/no-at-html-tags (renderMarkdown sanitizes rendered Markdown) -->
						{@html renderMarkdown(cardDescriptionDraft)}
					</div>
				{:else}
					<div class="markdown-preview">
						<!-- svelte-ignore svelte/no-at-html-tags (renderMarkdown sanitizes rendered Markdown) -->
						{@html renderMarkdown(selectedCard.descriptionMarkdown)}
					</div>
				{/if}
			</section>

			<section class="dialog-section">
				<div class="section-heading tight">
					<h2>Comments</h2>
					<span class="subtle-count">{selectedCard.comments.length}</span>
				</div>

				<form
					class="comment-form"
					onsubmit={(event) => (event.preventDefault(), handleAddComment())}
				>
					<textarea bind:value={commentDraft} placeholder="Add an update in Markdown."></textarea>
					<button class="primary-button compact" type="submit">
						<Plus size={17} />
						Comment
					</button>
				</form>

				<div class="comment-list">
					{#each selectedCard.comments as comment (comment.id)}
						<article class="comment-item">
							<header>
								<time datetime={comment.updatedAt}>{formatDate(comment.updatedAt)}</time>
								<div class="comment-actions">
									<button
										class="text-button"
										type="button"
										onclick={() => {
											editingCommentId = comment.id;
											editingCommentDraft = comment.bodyMarkdown;
										}}
									>
										Edit
									</button>
									<button
										class="text-button danger-text"
										type="button"
										onclick={() => handleDeleteComment(comment)}
									>
										Delete
									</button>
								</div>
							</header>

							{#if editingCommentId === comment.id}
								<textarea class="comment-edit" bind:value={editingCommentDraft}></textarea>
								<div class="inline-actions">
									<button
										class="primary-button compact"
										type="button"
										onclick={() => handleUpdateComment(comment)}
									>
										<Check size={16} />
										Save
									</button>
									<button
										class="secondary-button compact"
										type="button"
										onclick={() => {
											editingCommentId = null;
											editingCommentDraft = '';
										}}
									>
										Cancel
									</button>
								</div>
							{:else}
								<div class="markdown-preview compact-preview">
									<!-- svelte-ignore svelte/no-at-html-tags (renderMarkdown sanitizes rendered Markdown) -->
									{@html renderMarkdown(comment.bodyMarkdown)}
								</div>
							{/if}
						</article>
					{/each}
				</div>
			</section>
		</div>

		<footer class="dialog-footer">
			<button class="secondary-button danger-secondary" type="button" onclick={handleDeleteCard}>
				<Trash2 size={17} />
				Delete card
			</button>
			<button
				class="primary-button"
				type="button"
				onclick={() => handleSaveCard({ closeAfterSave: true })}
			>
				<Check size={18} />
				Save card
			</button>
		</footer>
	</aside>
{/if}
