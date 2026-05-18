export type ISODateString = string;

export type BoardRecord = {
	id: string;
	name: string;
	defaultTemplateId: string | null;
	createdAt: ISODateString;
	updatedAt: ISODateString;
};

export type StackRecord = {
	id: string;
	boardId: string;
	name: string;
	position: number;
	createdAt: ISODateString;
	updatedAt: ISODateString;
};

export type CardComment = {
	id: string;
	createdAt: ISODateString;
	updatedAt: ISODateString;
	bodyMarkdown: string;
};

export type CardDateType = 'start' | 'due' | 'milestone' | 'custom';

export type CardDateEntry = {
	id: string;
	type: CardDateType;
	label: string;
	date: string;
};

export type CardChecklistItem = {
	id: string;
	label: string;
	checked: boolean;
	parentId: string | null;
	position: number;
	createdAt: ISODateString;
	updatedAt: ISODateString;
};

export type CardChecklist = {
	id: string;
	name: string;
	items: CardChecklistItem[];
	position: number;
	createdAt: ISODateString;
	updatedAt: ISODateString;
};

export type CustomFieldType =
	| 'text'
	| 'multiline'
	| 'number'
	| 'checkbox'
	| 'select'
	| 'multiselect'
	| 'date'
	| 'url';

export type CustomFieldOption = {
	id: string;
	name: string;
};

export type CustomFieldValue = string | number | boolean | string[] | null;

export type CustomFieldDefinition = {
	id: string;
	boardId: string;
	name: string;
	type: CustomFieldType;
	options: CustomFieldOption[];
	showOnCard: boolean;
	position: number;
	createdAt: ISODateString;
	updatedAt: ISODateString;
};

export type LabelRecord = {
	id: string;
	boardId: string;
	name: string;
	color: string;
	createdAt: ISODateString;
	updatedAt: ISODateString;
};

export type CardTemplateRecord = {
	id: string;
	boardId: string;
	name: string;
	descriptionMarkdown: string;
	labelIds: string[];
	dates: CardDateEntry[];
	checklists: CardChecklist[];
	customFields: Record<string, CustomFieldValue>;
	customFieldOrder: string[];
	createdAt: ISODateString;
	updatedAt: ISODateString;
};

export type CardTemplateState = 'linked' | 'custom';

export type CardRecord = {
	id: string;
	boardId: string;
	stackId: string;
	name: string;
	templateId: string | null;
	templateState: CardTemplateState;
	descriptionMarkdown: string;
	labelIds: string[];
	dates: CardDateEntry[];
	checklists: CardChecklist[];
	customFields: Record<string, CustomFieldValue>;
	customFieldOrder: string[];
	comments: CardComment[];
	position: number;
	createdAt: ISODateString;
	updatedAt: ISODateString;
};

export type PreferenceKey = 'lastBoardId';

export type AppPreference = {
	key: PreferenceKey;
	value: string | null;
};

export type BoardSnapshot = {
	board: BoardRecord;
	stacks: StackRecord[];
	cards: CardRecord[];
	templates: CardTemplateRecord[];
	customFields: CustomFieldDefinition[];
	labels: LabelRecord[];
};
