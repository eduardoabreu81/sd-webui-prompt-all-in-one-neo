<template>
    <Transition name="fadeDown">
        <div class="physton-prompt-quality-presets" v-if="isOpen" @click="onCloseClick">
            <div class="quality-presets-main" @click.stop>
                <div class="quality-presets-close" @click="onCloseClick">
                    <icon-svg name="close"/>
                </div>
                <div class="quality-presets-title">Quality Presets</div>
                <div class="quality-presets-content">

                    <!-- CivitAI API key -->
                    <div class="qp-row">
                        <div class="qp-label">CivitAI API Key</div>
                        <div class="qp-field">
                            <input type="password" v-model="apiKey"
                                   placeholder="Optional – required for private models"/>
                            <div class="qp-btn" @click="onSaveKey">Save</div>
                        </div>
                        <div class="qp-hint">Used to query baseModel from CivitAI by SHA-256 hash.</div>
                    </div>

                    <!-- Detect current model -->
                    <div class="qp-section-title">Current Model</div>
                    <div class="qp-detect-row">
                        <div class="qp-btn" @click="onDetect">
                            <icon-svg v-if="detecting" name="loading"/>
                            <template v-else>Detect</template>
                        </div>
                        <div class="detect-result" v-if="detection">
                            <span :class="['source-badge', 'source-' + detection.source]">{{ detection.source }}</span>
                            <span class="detect-model" v-if="detection.base_model">{{ detection.base_model }}</span>
                            <span class="detect-file" v-if="checkpointName">— {{ checkpointName }}</span>
                        </div>
                    </div>

                    <template v-if="detection && detection.source !== 'none'">
                        <div class="qp-tags-block" v-if="allPositiveTags.length">
                            <div class="qp-tags-label">Positive</div>
                            <div class="qp-tags">
                                <span class="qp-chip" v-for="t in allPositiveTags" :key="t">{{ t }}</span>
                            </div>
                        </div>
                        <div class="qp-tags-block" v-if="allNegativeTags.length">
                            <div class="qp-tags-label qp-tags-label-neg">Negative</div>
                            <div class="qp-tags">
                                <span class="qp-chip qp-chip-neg" v-for="t in allNegativeTags" :key="t">{{ t }}</span>
                            </div>
                        </div>
                        <div class="qp-actions">
                            <div class="qp-btn qp-btn-pos" @click="onInsertPositive"
                                 v-if="allPositiveTags.length">↑ Insert Positive</div>
                            <div class="qp-btn qp-btn-neg" @click="onInsertNegative"
                                 v-if="allNegativeTags.length">↑ Insert Negative</div>
                        </div>
                    </template>

                    <div class="qp-no-match" v-else-if="detection && detection.source === 'none'">
                        No match found. Add a Custom Preset below or check that the model is on CivitAI.
                    </div>

                    <!-- Custom presets list -->
                    <div class="qp-section-title">
                        Custom Presets
                        <div class="qp-btn qp-btn-add" @click="showAddForm = !showAddForm">+ Add</div>
                    </div>

                    <div class="qp-add-form" v-if="showAddForm">
                        <div class="qp-form-row">
                            <label>Name</label>
                            <input type="text" v-model="newPreset.name" placeholder="My Pony Models"/>
                        </div>
                        <div class="qp-form-row">
                            <label>Filename substrings (comma-separated)</label>
                            <input type="text" v-model="newPreset.match_substr_str"
                                   placeholder="pony, pdxl"/>
                        </div>
                        <div class="qp-form-row">
                            <label>Positive prefix tags (comma-separated)</label>
                            <input type="text" v-model="newPreset.positive_prefix_str"
                                   placeholder="score_9, score_8_up"/>
                        </div>
                        <div class="qp-form-row">
                            <label>Negative prefix tags (comma-separated)</label>
                            <input type="text" v-model="newPreset.negative_prefix_str"
                                   placeholder="worst quality"/>
                        </div>
                        <div class="qp-form-row qp-form-inline">
                            <label>Auto-insert on load</label>
                            <input type="checkbox" v-model="newPreset.auto_insert"/>
                        </div>
                        <div class="qp-form-actions">
                            <div class="qp-btn" @click="onAddPreset">Save Preset</div>
                            <div class="qp-btn qp-btn-cancel" @click="showAddForm = false">Cancel</div>
                        </div>
                    </div>

                    <div class="qp-preset-list">
                        <div class="qp-preset-item" v-for="(preset, idx) in userPresets" :key="idx">
                            <div class="qp-preset-header">
                                <span class="qp-preset-name">{{ preset.name }}</span>
                                <span class="qp-auto-badge" v-if="preset.auto_insert">auto</span>
                                <div class="qp-preset-del" @click="onDeletePreset(idx)">
                                    <icon-svg name="remove"/>
                                </div>
                            </div>
                            <div class="qp-preset-meta" v-if="preset.match_substr && preset.match_substr.length">
                                match: {{ preset.match_substr.join(', ') }}
                            </div>
                            <div class="qp-tags qp-tags-sm"
                                 v-if="preset.positive_prefix && preset.positive_prefix.length">
                                <span class="qp-chip" v-for="t in preset.positive_prefix" :key="t">{{ t }}</span>
                            </div>
                        </div>
                        <div class="qp-empty" v-if="!userPresets.length">No custom presets yet.</div>
                    </div>

                </div>
            </div>
        </div>
    </Transition>
</template>

<script>
import LanguageMixin from "@/mixins/languageMixin";
import IconSvg from "@/components/iconSvg.vue";

export default {
    name: 'QualityPresets',
    components: {IconSvg},
    mixins: [LanguageMixin],
    emits: ['insert-positive', 'insert-negative'],
    data() {
        return {
            isOpen: false,
            apiKey: '',
            detecting: false,
            detection: null,
            userPresets: [],
            showAddForm: false,
            newPreset: {
                name: '',
                match_substr_str: '',
                positive_prefix_str: '',
                negative_prefix_str: '',
                auto_insert: false,
            },
        }
    },
    computed: {
        checkpointName() {
            const p = this.detection?.checkpoint_path
            if (!p) return ''
            return p.replace(/\\/g, '/').split('/').pop()
        },
        allPositiveTags() {
            if (!this.detection) return []
            return [
                ...(this.detection.positive_prefix || []),
                ...(this.detection.positive_embeddings || []),
            ]
        },
        allNegativeTags() {
            if (!this.detection) return []
            return [
                ...(this.detection.negative_prefix || []),
                ...(this.detection.negative_embeddings || []),
            ]
        },
    },
    methods: {
        open() {
            this.isOpen = true
            this.detection = null
            this.showAddForm = false
            this._resetNewPreset()
            this._loadPresets()
        },
        close() {
            this.isOpen = false
        },
        onCloseClick() {
            this.close()
        },
        _resetNewPreset() {
            this.newPreset = {
                name: '',
                match_substr_str: '',
                positive_prefix_str: '',
                negative_prefix_str: '',
                auto_insert: false,
            }
        },
        _loadPresets() {
            this.gradioAPI.getQualityPresets().then(data => {
                if (!data) return
                this.apiKey = data.api_key || ''
                this.userPresets = data.presets || []
            }).catch(() => {})
        },
        _saveAll() {
            return this.gradioAPI.saveQualityPresets({
                api_key: this.apiKey,
                presets: this.userPresets,
            })
        },
        onSaveKey() {
            this._saveAll()
        },
        onDetect() {
            if (this.detecting) return
            this.detecting = true
            this.detection = null
            // Save API key first so the backend uses it during detection
            this._saveAll().then(() => {
                return this.gradioAPI.detectModelPreset()
            }).then(result => {
                this.detection = result
                this.detecting = false
            }).catch(() => {
                this.detecting = false
            })
        },
        onInsertPositive() {
            if (!this.allPositiveTags.length) return
            this.$emit('insert-positive', this.allPositiveTags)
        },
        onInsertNegative() {
            if (!this.allNegativeTags.length) return
            this.$emit('insert-negative', this.allNegativeTags)
        },
        onAddPreset() {
            if (!this.newPreset.name.trim()) return
            this.userPresets.push({
                name: this.newPreset.name.trim(),
                match_exact: [],
                match_substr: this.newPreset.match_substr_str
                    .split(',').map(s => s.trim()).filter(Boolean),
                positive_prefix: this.newPreset.positive_prefix_str
                    .split(',').map(s => s.trim()).filter(Boolean),
                negative_prefix: this.newPreset.negative_prefix_str
                    .split(',').map(s => s.trim()).filter(Boolean),
                positive_embeddings: [],
                negative_embeddings: [],
                auto_insert: this.newPreset.auto_insert,
            })
            this._saveAll()
            this.showAddForm = false
            this._resetNewPreset()
        },
        onDeletePreset(idx) {
            this.userPresets.splice(idx, 1)
            this._saveAll()
        },
    },
}
</script>

<style scoped>
.physton-prompt-quality-presets {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, .45);
}

.quality-presets-main {
    position: relative;
    width: 520px;
    max-width: 96vw;
    max-height: 88vh;
    overflow-y: auto;
    background: var(--background-fill-primary, #1a1a1a);
    border-radius: 8px;
    padding: 20px 24px 24px;
    box-sizing: border-box;
    color: var(--body-text-color, #eee);
    font-family: var(--font, sans-serif);
    font-size: 13px;
}

.quality-presets-close {
    position: absolute;
    top: 10px;
    right: 12px;
    cursor: pointer;
    opacity: .6;
    transition: opacity .15s;
    width: 18px;
    height: 18px;
}
.quality-presets-close:hover { opacity: 1; }

.quality-presets-title {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 16px;
    padding-right: 24px;
}

/* --- rows --- */
.qp-row { margin-bottom: 12px; }
.qp-label { font-size: 12px; font-weight: 600; margin-bottom: 4px; opacity: .8; }
.qp-field { display: flex; gap: 6px; align-items: center; }
.qp-field input[type="password"],
.qp-field input[type="text"] {
    flex: 1;
    background: var(--input-background-fill, #2a2a2a);
    border: 1px solid var(--border-color-primary, #444);
    border-radius: 4px;
    color: inherit;
    padding: 5px 8px;
    font-size: 12px;
    outline: none;
}
.qp-hint { font-size: 11px; opacity: .5; margin-top: 3px; }

/* --- buttons --- */
.qp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    background: var(--button-secondary-background-fill, #3a3a3a);
    color: var(--button-secondary-text-color, #eee);
    border: 1px solid var(--border-color-primary, #555);
    transition: opacity .15s;
    white-space: nowrap;
    user-select: none;
}
.qp-btn:hover { opacity: .8; }
.qp-btn-pos { background: #2a4a2a; border-color: #4a7a4a; }
.qp-btn-neg { background: #4a2a2a; border-color: #7a4a4a; }
.qp-btn-add { font-size: 11px; padding: 3px 8px; }
.qp-btn-cancel { opacity: .6; }

/* --- sections --- */
.qp-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    opacity: .7;
    text-transform: uppercase;
    letter-spacing: .05em;
    margin: 16px 0 8px;
    border-bottom: 1px solid var(--border-color-primary, #333);
    padding-bottom: 5px;
}

/* --- detect --- */
.qp-detect-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.detect-result { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.source-badge {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 10px;
    font-weight: 600;
    text-transform: uppercase;
}
.source-civitai  { background: #1a3a5a; color: #6ab4ff; }
.source-preset   { background: #2a3a1a; color: #8add6a; }
.source-builtin  { background: #3a3a1a; color: #e0d060; }
.source-none     { background: #3a1a1a; color: #d06060; }
.detect-model  { font-weight: 600; }
.detect-file   { opacity: .55; font-size: 11px; }

/* --- tags --- */
.qp-tags-block { margin: 8px 0; }
.qp-tags-label {
    font-size: 11px;
    font-weight: 600;
    opacity: .65;
    margin-bottom: 4px;
}
.qp-tags-label-neg { color: #d08080; }
.qp-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.qp-chip {
    background: #2a4a2a;
    color: #8add6a;
    border-radius: 3px;
    padding: 2px 7px;
    font-size: 11px;
}
.qp-chip-neg { background: #4a2a2a; color: #d08080; }
.qp-tags-sm .qp-chip { font-size: 10px; padding: 1px 5px; }

.qp-actions { display: flex; gap: 8px; margin-top: 10px; }

.qp-no-match {
    font-size: 12px;
    opacity: .6;
    font-style: italic;
    margin: 8px 0;
}

/* --- add form --- */
.qp-add-form {
    background: var(--background-fill-secondary, #222);
    border: 1px solid var(--border-color-primary, #333);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 10px;
}
.qp-form-row { margin-bottom: 8px; }
.qp-form-row label {
    display: block;
    font-size: 11px;
    opacity: .7;
    margin-bottom: 3px;
}
.qp-form-row input[type="text"] {
    width: 100%;
    box-sizing: border-box;
    background: var(--input-background-fill, #2a2a2a);
    border: 1px solid var(--border-color-primary, #444);
    border-radius: 4px;
    color: inherit;
    padding: 4px 7px;
    font-size: 12px;
    outline: none;
}
.qp-form-inline { display: flex; align-items: center; gap: 8px; }
.qp-form-inline label { margin: 0; }
.qp-form-actions { display: flex; gap: 8px; margin-top: 10px; }

/* --- preset list --- */
.qp-preset-list { display: flex; flex-direction: column; gap: 6px; }
.qp-preset-item {
    background: var(--background-fill-secondary, #1e1e1e);
    border: 1px solid var(--border-color-primary, #333);
    border-radius: 5px;
    padding: 8px 10px;
}
.qp-preset-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.qp-preset-name { font-weight: 600; flex: 1; }
.qp-auto-badge {
    font-size: 10px;
    background: #1a3a5a;
    color: #6ab4ff;
    border-radius: 8px;
    padding: 1px 6px;
}
.qp-preset-del { cursor: pointer; opacity: .4; width: 14px; height: 14px; transition: opacity .15s; }
.qp-preset-del:hover { opacity: .9; }
.qp-preset-meta { font-size: 11px; opacity: .5; margin-bottom: 4px; }

.qp-empty { font-size: 12px; opacity: .45; font-style: italic; padding: 6px 0; }
</style>
