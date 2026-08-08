// Wizard option values, translated for display.
//
// ─────────────────────────────────────────────────────────────────────────────
// MIRRORED FROM tea-taste-frontend/src/i18n/options.js. Change both.
// ─────────────────────────────────────────────────────────────────────────────
//
// Same contract as ./descriptors.js: the **Russian string is the stored value**.
// `form.country`, `form.teaware` and `form.brewingtype` hold the Russian label
// verbatim — the wizard's fields are free-text, so they also hold whatever a
// user typed that is not in any list. Nothing here migrates data; a value with
// no entry falls back to what is stored, which is what the site showed before.
//
// WHAT IS DELIBERATELY NOT TRANSLATED
//
// Water brands (Архыз, Сестрица, Святой Источник…) and shops (Мойчай.ру,
// Чайный квадрат…) are proper nouns. Someone reading a tasting in English who
// wants that water has to search for the name on the bottle, and "Arkhyz Spring
// Water" is not a name any shop lists. They stay as written, which is also how
// Evian and Wildberries already appear in the same lists.

const { teaTypeName, teaTypeSlugs } = require('./teaTypes');

const COUNTRIES = {
    'Китай': { en: 'China', zh: '中国' },
    'Индия': { en: 'India', zh: '印度' },
    'Кения': { en: 'Kenya', zh: '肯尼亚' },
    'Шри-Ланка': { en: 'Sri Lanka', zh: '斯里兰卡' },
    'Вьетнам': { en: 'Vietnam', zh: '越南' },
    'Индонезия': { en: 'Indonesia', zh: '印度尼西亚' },
    'Япония': { en: 'Japan', zh: '日本' },
    'Турция': { en: 'Turkey', zh: '土耳其' },
    'Иран': { en: 'Iran', zh: '伊朗' },
    'Аргентина': { en: 'Argentina', zh: '阿根廷' },
    'Непал': { en: 'Nepal', zh: '尼泊尔' },
    'Тайвань': { en: 'Taiwan', zh: '台湾' },
    'Малайзия': { en: 'Malaysia', zh: '马来西亚' },
    'Мьянма': { en: 'Myanmar', zh: '缅甸' },
    'Бангладеш': { en: 'Bangladesh', zh: '孟加拉国' },
    'Уганда': { en: 'Uganda', zh: '乌干达' },
    'Танзания': { en: 'Tanzania', zh: '坦桑尼亚' },
    'Малави': { en: 'Malawi', zh: '马拉维' },
    'Руанда': { en: 'Rwanda', zh: '卢旺达' },
    'Южная Корея': { en: 'South Korea', zh: '韩国' },
    'Грузия': { en: 'Georgia', zh: '格鲁吉亚' },
    'Россия': { en: 'Russia', zh: '俄罗斯' },
    'Бразилия': { en: 'Brazil', zh: '巴西' },
    'Мозамбик': { en: 'Mozambique', zh: '莫桑比克' },
    'Камерун': { en: 'Cameroon', zh: '喀麦隆' },
    'Зимбабве': { en: 'Zimbabwe', zh: '津巴布韦' },
    'Папуа — Новая Гвинея': { en: 'Papua New Guinea', zh: '巴布亚新几内亚' },
    'Таиланд': { en: 'Thailand', zh: '泰国' },
    'Лаос': { en: 'Laos', zh: '老挝' },
    'Мексика': { en: 'Mexico', zh: '墨西哥' },
    'США': { en: 'USA', zh: '美国' },
    'Австралия': { en: 'Australia', zh: '澳大利亚' },
};

// Teaware. Most of these are Chinese or Japanese in origin and have settled
// English forms, so the Chinese column is the original word rather than a
// translation of the Russian — 盖碗 is what a gaiwan has always been called.
const TEAWARE = {
    'Чайник': { en: 'Teapot', zh: '茶壶' },
    'Гайвань': { en: 'Gaiwan', zh: '盖碗' },
    'Типот': { en: 'Teapot with infuser button', zh: '按钮泡茶壶' },
    'Чахай (сливник)': { en: 'Cha hai (fairness pitcher)', zh: '茶海（公道杯）' },
    'Пиала': { en: 'Tea bowl', zh: '茶杯' },
    'Чайник из исинской глины': { en: 'Yixing clay teapot', zh: '宜兴紫砂壶' },
    'Стеклянный чайник': { en: 'Glass teapot', zh: '玻璃茶壶' },
    'Чугунный чайник (тэцубин)': { en: 'Cast iron teapot (tetsubin)', zh: '铁壶（铁瓶）' },
    'Чайная доска (чабань)': { en: 'Tea tray (cha ban)', zh: '茶盘' },
    'Ситечко': { en: 'Tea strainer', zh: '茶滤' },
    'Термос': { en: 'Thermos', zh: '保温瓶' },
    'Самовар': { en: 'Samovar', zh: '茶炊' },
    'Кружка-заварник': { en: 'Infuser mug', zh: '泡茶杯' },
    'Колба для заваривания': { en: 'Brewing flask', zh: '冲泡瓶' },
    'Люйчаван': { en: 'Lü cha wan', zh: '绿茶碗' },
};

const BREWING = {
    'Настаивание (по-европейски)': { en: 'Steeping (Western style)', zh: '西式浸泡' },
    'Проливы (по-китайски)': { en: 'Short steeps (gongfu)', zh: '功夫泡法' },
    'Заваривание в термосе': { en: 'Brewed in a thermos', zh: '保温瓶冲泡' },
    'Холодное заваривание (Cold Brew)': { en: 'Cold brew', zh: '冷泡' },
    'Варка чая': { en: 'Boiled', zh: '煮茶' },
    'Заваривание в пуровере': { en: 'Pour-over', zh: '手冲' },
    'Заваривание в сифоне': { en: 'Siphon', zh: '虹吸壶' },
    'Заваривание в аэропрессе': { en: 'AeroPress', zh: '爱乐压' },
};

// One lookup for every field whose stored value may be translatable. Merged
// rather than kept apart because the caller knows the field, not the category,
// and no two of these lists share a key.
const OPTION_VALUES = { ...COUNTRIES, ...TEAWARE, ...BREWING };

// Translate a stored option value. Falls back to the stored string — which is
// what a water brand, a shop name, and anything a user typed themselves will
// always do.
const translateOption = (value, locale) => {
    if (!value || locale === 'ru') return value;
    const entry = OPTION_VALUES[value];
    return (entry && entry[locale]) || value;
};

// The display label for any wizard option, whichever list it came from.
//
// teaTypeName and translateOption both return their input untouched when they
// do not recognise it, so chaining them covers every list without the caller
// having to know which one it is holding. Handles the two shapes MUI hands back
// from a freeSolo Autocomplete as well: a plain string the user typed, and the
// synthetic "add this" option.
// Both branches chain the same two lookups. They did not: the string branch
// skipped teaTypeName, and the edit dialog stores plain strings — so a tasting
// whose type read «Улун» everywhere else read «Улун (乌龙茶 - Wūlóng chá)» there,
// in the middle of an otherwise English form.
const displayValue = (stored, locale) => translateOption(teaTypeName(stored, locale), locale);

const optionLabel = (option, locale) => {
    if (!option) return '';
    if (typeof option === 'string') return displayValue(option, locale);
    if (option.inputValue) return option.inputValue;
    return displayValue(option.label || '', locale);
};

// The reverse: a label the user picked, back to the Russian that gets stored.
//
// Needed because the free-text fields keep the picked string itself rather than
// an option object, and storing "Gaiwan" would break the rule the whole scheme
// rests on — the Russian string is the key every other language looks up
// against. Text the user typed freely is not in any table and is returned
// unchanged, which is exactly right: it is their words, not ours.
const REVERSE = new Map();
for (const [ru, translations] of Object.entries(OPTION_VALUES)) {
    for (const value of Object.values(translations)) REVERSE.set(value, ru);
}
for (const type of teaTypeSlugs) {
    for (const key of ['en', 'zh']) REVERSE.set(type[key], type.label);
}

const canonicalOption = (display, locale) => {
    if (!display || locale === 'ru') return display;
    return REVERSE.get(display) || display;
};

module.exports = {
  OPTION_VALUES, COUNTRIES, TEAWARE, BREWING,
  translateOption, optionLabel, canonicalOption,
};
