import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.use({
	gfm: true,
	breaks: false
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node instanceof HTMLAnchorElement) {
		node.setAttribute('target', '_blank');
		node.setAttribute('rel', 'noreferrer');
	}
});

const emptyMarkdown = '<p class="muted-markdown">No description yet.</p>';

export function renderMarkdown(markdown: string) {
	const trimmed = markdown.trim();
	if (!trimmed) return emptyMarkdown;

	const rendered = marked.parse(trimmed, { async: false });

	return DOMPurify.sanitize(rendered, {
		USE_PROFILES: { html: true },
		ADD_ATTR: ['target', 'rel']
	});
}
