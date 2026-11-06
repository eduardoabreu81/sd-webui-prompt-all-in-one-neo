import common from "@/utils/common";
import GradioAPI from "@/utils/gradioAPI";

export default {
    data() {
        return {
            /**
             * @type {GradioAPI}
             */
            gradioAPI: null,
        }
    },
    beforeMount() {
        this.gradioAPI = new GradioAPI()
    },
    methods: {
        loadExtraNetworks(loadI = 0) {
            if (common.gradioApp().querySelectorAll("#txt2img_checkpoints_cards .card").length) {
                // console.log('系统ExtraNetworks已加载，开始加载ExtraNetworks')
                return this._loadExtraNetworks()
            }
            if (loadI > 10) {
                // console.log('超时10秒，开始加载ExtraNetworks')
                return this._loadExtraNetworks()
            }
            setTimeout(this.loadExtraNetworks, 1000, loadI + 1)
        },
        _loadExtraNetworks() {
            const getPromptLoraAlias = prompt => {
                if (typeof prompt !== 'string') return
                // Forge wraps the tag prefix in a JSON string before appending the weight.
                const quotedPrefix = prompt.match(/^"(?:\\.|[^"\\])*"/)?.[0]
                if (quotedPrefix) {
                    try {
                        prompt = JSON.parse(quotedPrefix)
                    } catch {
                        return
                    }
                }
                return prompt.match(/^<lora:([^:>]+):/i)?.[1]
            }
            this.gradioAPI.getExtraNetworks().then(res => {
                if (!res) return
                this.extraNetworks = res
                res.forEach(extraNetwork => {
                    if (extraNetwork.name === 'textual inversion') {
                        let list = {}
                        extraNetwork.items.forEach(item => {
                            list[item.name.toLowerCase()] = item.name
                        })
                        this.embeddings = list
                    } else if (extraNetwork.name === 'lora' || extraNetwork.name === 'lycoris') {
                        const list = Object.create(null)
                        extraNetwork.items.forEach(item => {
                            list[item.name.toLowerCase()] = item.name
                            // also map just the basename so tags inserted without subfolder path are found
                            const basename = item.name.replace(/\\/g, '/').split('/').pop()
                            if (basename && basename.toLowerCase() !== item.name.toLowerCase()) {
                                list[basename.toLowerCase()] = item.name
                            }
                            if (item.output_name) {
                                list[item.output_name.toLowerCase()] = item.name
                                const outputBasename = item.output_name.replace(/\\/g, '/').split('/').pop()
                                if (outputBasename && outputBasename.toLowerCase() !== item.output_name.toLowerCase()) {
                                    list[outputBasename.toLowerCase()] = item.name
                                }
                            }
                        })
                        if (extraNetwork.name === 'lora') {
                            // Canonical names and metadata names keep priority over prompt aliases.
                            for (const item of extraNetwork.items) {
                                const alias = getPromptLoraAlias(item.prompt)
                                if (alias) list[alias.toLowerCase()] ??= item.name
                            }
                            this.loras = list
                        } else {
                            this.lycos = list
                        }
                    }
                })
            })
        },
        getExtraNetworkFullName(name, type = 'lora') {
            if (typeof this.extraNetworks !== 'object') return name
            for (let extraNetwork of this.extraNetworks) {
                if (extraNetwork.name !== type) continue
                const nameLowerCase = name.toLowerCase()
                const resolvedName = type === 'lora' ? this.loras?.[nameLowerCase] : undefined
                for (let item of extraNetwork.items) {
                    const itemBasename = item.name.replace(/\\/g, '/').split('/').pop()
                    const matches = resolvedName
                        ? item.name === resolvedName
                        : item.name.toLowerCase() === nameLowerCase ||
                          item.output_name?.toLowerCase() === nameLowerCase ||
                          itemBasename?.toLowerCase() === nameLowerCase
                    if (matches) {
                        if (!item.civitai_info?.name) return name
                        if (item.civitai_info.model?.name && item.civitai_info.model.name !== item.civitai_info.name) {
                            return '[' + item.civitai_info.name + '] ' + item.civitai_info.model.name
                        } else {
                            return item.civitai_info.name
                        }
                    }
                }
            }
            return name
        },
        loraExists(name) {
            if (typeof this.loras !== 'object') return name
            return this.loras[name.toLowerCase()] ?? false
        },
        lycoExists(name) {
            if (typeof this.lycos !== 'object') return name
            return this.lycos[name.toLowerCase()] ?? false
        },
        embeddingExists(name) {
            if (typeof this.embeddings !== 'object') return name
            return this.embeddings[name.toLowerCase()] ?? false
        },
    }
}
