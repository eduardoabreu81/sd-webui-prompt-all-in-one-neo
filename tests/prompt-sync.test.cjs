// Run from the repository root: node --test tests/prompt-sync.test.cjs
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {createRequire} = require('node:module')
const {resolve} = require('node:path')
const {test} = require('node:test')
const vm = require('node:vm')

const root = resolve(__dirname, '..')
const requireFrontend = createRequire(resolve(root, 'src/package.json'))
const {parse} = requireFrontend('@vue/compiler-sfc')

// Execute the real component methods and parser without mounting the Forge UI.
// Rendering dependencies are unused here; HTTP/history are the external boundary.
function loadOptions(path, dependencies = {}) {
    let source = readFileSync(resolve(root, path), 'utf8')
    if (path.endsWith('.vue')) source = parse(source).descriptor.script.content
    source = source.replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
    const context = {
        module: {exports: {}},
        console: {log() {}},
        ...dependencies,
    }
    vm.runInNewContext(source, context, {filename: path})
    return context.module.exports
}

const splitTags = loadOptions('src/src/utils/splitTags.js')
const common = loadOptions('src/src/utils/common.js', {
    splitTags,
    globals: loadOptions('src/globals.js'),
    tinycolor: requireFrontend('tinycolor2'),
})
const tagMixin = loadOptions('src/src/mixins/phystonPrompt/tagMixin.js', {common})
const commonMixin = loadOptions('src/src/mixins/commonMixin.js', {common})

function makePrompt(options = {}) {
    const inputs = []
    const histories = []
    const component = loadOptions('src/src/components/phystonPrompt.vue', {
        common,
        ...Object.fromEntries([
            'Sortable', 'LanguageMixin', 'VueNumberInput', 'HeaderMixin', 'DropMixin',
            'TagMixin', 'GroupTagsMixin', 'IconSvg', 'HighlightPrompt', 'ColorPicker',
        ].map(name => [name, {}])),
        updateInput: textarea => inputs.push(textarea.value),
    })
    const prompt = {
        ...Object.fromEntries(Object.entries(component.props).map(([name, prop]) => [name, prop.default])),
        ...component.data(),
        ...commonMixin.methods,
        ...tagMixin.methods,
        ...component.methods,
        textarea: {value: '', parentElement: {getElementsByClassName: () => []}},
        steps: {querySelector: () => ({value: '20'})},
        loras: {}, lycos: {}, embeddings: {}, blacklist: {},
        $appMode: true,
        $nextTick() {}, // Layout is outside this method-level regression test.
        gradioAPI: {
            getLatestHistory: async () => null,
            pushHistory: async (key, tags, text) => histories.push(text),
        },
        ...options,
    }
    for (const key of Object.keys(component.methods)) prompt[key] = prompt[key].bind(prompt)
    return {prompt, inputs, histories}
}

// Forge's native toggle requires the literal activation suffix to survive.
// This boundary fixture mirrors tryToRemoveExtraNetworkFromPrompt/updatePromptArea:
// https://github.com/Haoming02/sd-webui-forge-classic/blob/neo/javascript/extraNetworks.js#L223-L277
function clickLora(textarea, text, separator = ' ') {
    const [, network, activation] = text.match(/<([^:^>]+:[^:]+):[\d.]+>(.*)/s)
    let position = -1
    let value = textarea.value.replace(/<([^:^>]+:[^:]+):[\d.]+>/g, (found, name, offset) => {
        if (name !== network) return found
        position = offset
        return ''
    })
    if (position < 0) {
        textarea.value += separator + text
        return
    }
    if (activation && value.substr(position, activation.length) === activation) {
        value = value.slice(0, position) + value.slice(position + activation.length)
    }
    if (value.substr(position - separator.length, separator.length) === separator) {
        value = value.slice(0, position - separator.length) + value.slice(position)
    }
    textarea.value = value
}

for (const activation of [
    'shiratori misaki,1girl,blue eyes,long hair,silver hair,white hair,grey hair,huge breasts,',
    'shiratori misaki,1girl,blue eyes, long hair, silver hair, white hair, grey hair, huge breasts,',
]) {
    for (const autoRemoveSpace of [true, false]) {
        test(`LoRA toggle removes its activation text (${autoRemoveSpace ? 'compact' : 'spaced'} format, ${activation.includes(', ') ? 'mixed' : 'compact'} activation)`, () => {
            const {prompt} = makePrompt({autoRemoveSpace})
            const card = '<lora:model_name:0.7> ' + activation
            for (let cycle = 0; cycle < 2; cycle++) {
                clickLora(prompt.textarea, card)
                prompt._onTextareaChange(true)
                assert.equal(prompt.tags.length, 9)
                clickLora(prompt.textarea, card)
                prompt._onTextareaChange(true)
                assert.equal(prompt.textarea.value, '')
                assert.equal(prompt.tags.length, 0)
            }
        })
    }
}

test('import preserves exact prompt bytes, metadata and history without an input echo', async () => {
    const {prompt, inputs, histories} = makePrompt()
    const raw = '  <lora:model_name:0.7> trigger, blue eyes,\nlong hair,  '
    prompt.tags = [{value: 'blue eyes', localValue: 'olhos azuis', disabled: false}]
    prompt.textarea.value = raw
    prompt._onTextareaChange(true)
    await new Promise(setImmediate)
    assert.equal(prompt.textarea.value, raw)
    assert.equal(prompt.prompt, raw)
    assert.equal(prompt.tags.find(tag => tag.value === 'blue eyes').localValue, 'olhos azuis')
    assert.deepEqual(inputs, [])
    assert.deepEqual(histories, [raw])
})

test('toggling one of two LoRAs preserves the other LoRA and existing tags', () => {
    const {prompt} = makePrompt()
    prompt.textarea.value = 'landscape, blue eyes'
    const first = '<lora:first:0.7> blue eyes,long hair,'
    const second = '<lora:second:1> second trigger, silver hair,'
    clickLora(prompt.textarea, first)
    prompt._onTextareaChange(true)
    clickLora(prompt.textarea, second)
    prompt._onTextareaChange(true)
    clickLora(prompt.textarea, first)
    prompt._onTextareaChange(true)
    assert.equal(prompt.textarea.value, 'landscape, blue eyes <lora:second:1> second trigger, silver hair,')
    clickLora(prompt.textarea, second)
    prompt._onTextareaChange(true)
    assert.equal(prompt.textarea.value, 'landscape, blue eyes')
})

test('an intentional tag edit still writes the configured prompt format', () => {
    const {prompt, inputs} = makePrompt({autoRemoveSpace: true, autoRemoveLastComma: true})
    prompt.textarea.value = 'blue eyes, long hair'
    prompt._onTextareaChange(true)
    prompt.tags[0].value = 'green eyes'
    prompt.updateTags()
    assert.equal(prompt.textarea.value, 'green eyes,long hair')
    assert.deepEqual(inputs, ['green eyes,long hair'])
})

test('local translation completion preserves the externally inserted activation text', async () => {
    const {prompt} = makePrompt({autoTranslateToLocal: true, languageCode: 'en_US'})
    const card = '<lora:model_name:0.7> trigger, blue eyes,'
    clickLora(prompt.textarea, card)
    prompt._onTextareaChange(true)
    await new Promise(setImmediate)
    clickLora(prompt.textarea, card)
    prompt._onTextareaChange(true)
    await new Promise(setImmediate)
    assert.equal(prompt.textarea.value, '')
    assert.equal(prompt.tags.length, 0)
})

test('external synchronization retains disabled tags without enabling them in the textarea', () => {
    const {prompt} = makePrompt()
    prompt.tags = [{value: 'disabled tag', localValue: '', disabled: true}]
    prompt.textarea.value = 'blue eyes'
    prompt._onTextareaChange(true)
    assert.equal(prompt.tags[0].value, 'disabled tag')
    assert.equal(prompt.tags[0].disabled, true)
    assert.equal(prompt.textarea.value, 'blue eyes')
    prompt.tags[1].value = 'green eyes'
    prompt.updateTags()
    assert.equal(prompt.textarea.value, 'green eyes, ')
})

test('externally imported blacklisted tags are still removed from the prompt', () => {
    const {prompt} = makePrompt({blacklist: {prompt: ['unwanted']}, autoRemoveLastComma: true})
    prompt.textarea.value = 'unwanted, blue eyes'
    prompt._onTextareaChange(true)
    assert.equal(prompt.textarea.value, 'blue eyes')
})
