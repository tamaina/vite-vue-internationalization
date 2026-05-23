export function injectScriptSetup(code: string, injection: string): string {
	const setupOpen = code.match(/<script\b(?=[^>]*\bsetup\b)[^>]*>/);

	if (setupOpen?.index != null) {
		const insertAt = setupOpen.index + setupOpen[0].length;
		return `${code.slice(0, insertAt)}${injection}${code.slice(insertAt)}`;
	}

	return `${code}\n<script setup lang="ts">${injection}</script>\n`;
}

export function getScriptSetupOpenTag(code: string): string | undefined {
	return code.match(/<script\b(?=[^>]*\bsetup\b)[^>]*>/)?.[0];
}
