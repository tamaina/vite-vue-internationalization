export { vueInternationalization } from './plugin.js';
export type {
	LocaleDictionary,
	LocaleMessages,
	VueInternationalizationOptions,
} from './plugin.js';
export {
	compileLocaleMessage,
	formatLocaleMessage,
	getLocaleMessageListIndexes,
	getLocaleMessageNamedKeys,
	hasLocaleMessagePlural,
} from './message.js';
export type {
	LocaleMessageAst,
	LocaleMessageContext,
	LocaleMessageListValues,
	LocaleMessageNamedValues,
	LocaleMessageToken,
	LocaleMessageValue,
	LocaleMessageValues,
} from './message.js';
export {
	createInternationalization,
	formatLocaleTemplate,
	setActiveInternationalization,
	useDateTimeFormat,
	useInternationalization,
	useLocale,
	useLocalizer,
	useNumberFormat,
} from './runtime.js';
export type {
	InternationalizationInstance,
	InternationalizationRuntimeOptions,
	LocaleBundle,
	LocaleDateTimeFormatName,
	LocaleDateTimeFormatOptions,
	LocaleDateTimeFormatSource,
	LocaleDateTimeFormatter,
	LocaleDateTimeValue,
	LocaleLocalizerDictionary,
	LocaleLocalizerScope,
	LocaleLoader,
	LocaleNumberFormatName,
	LocaleNumberFormatOptions,
	LocaleNumberFormatSource,
	LocaleNumberFormatter,
	LocaleNumberValue,
	RuntimeLocaleDictionary,
	LocaleTemplateFunction,
	LocaleTemplateValue,
	LocaleTemplateValues,
} from './runtime.js';
