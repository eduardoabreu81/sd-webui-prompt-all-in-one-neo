import common from "@/utils/common";
import GradioAPI from "@/utils/gradioAPI";

export default {
    data() {
        return {
            /**
             * @type {GradioAPI}
             */
            gradioAPI: null,
            extraNetworksLoaded: false,
            _loras: {},
            _lycos: {},
            _embeddings: {},
        }
    },
    beforeMount() {
        this.gradioAPI = new GradioAPI()
    },
    methods: {
        loadExtraNetworks(loadI = 0) {
            if (common.gradioApp().querySelectorAll("#txt2img_checkpoints_cards .card").length) {
                return this._loadExtraNetworks()
            }
            if (loadI > 10) {
                return this._loadExtraNetworks()
            }
            setTimeout(this.loadExtraNetworks, 1000, loadI + 1)
        },
        async _loadExtraNetworks() {
            try {
                const dirsData = await this.gradioAPI.getExtraNetworksDirs()
                if (!dirsData) return

                // Only update if we haven't loaded items yet
                const hasLoadedItems = this.extraNetworks.some(page => page.items && Object.keys(page.items).length > 0)
                if (hasLoadedItems) return

                this.extraNetworks = dirsData.map(page => ({
                    name: page.name,
                    title: page.title,
                    dirs: page.dirs,
                    items: {},
                }))

                this.extraNetworksLoaded = true
            } catch (e) {
                console.error('[sd-webui-prompt-all-in-one] loadExtraNetworks dirs error:', e)
            }
        },
        async loadExtraNetworksItems(name, dirname) {
            try {
                const itemsData = await this.gradioAPI.getExtraNetworksItems(name, dirname, 200, 200)
                if (!itemsData || !itemsData.length) return

                const page = this.extraNetworks.find(p => p.name === name)
                if (!page) return

                const items = itemsData[0]?.items || []
                page.items[dirname] = items

                if (name === 'textual inversion') {
                    let list = {}
                    items.forEach(item => {
                        list[item.name.toLowerCase()] = item.name
                    })
                    this._embeddings = list
                } else if (name === 'lora') {
                    let list = {}
                    items.forEach(item => {
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
                    this._loras = {...this._loras, ...list}
                } else if (name === 'lycoris') {
                    let list = {}
                    items.forEach(item => {
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
                    this._lycos = {...this._lycos, ...list}
                }

                this.$emit('update:extraNetworks', this.extraNetworks)
                this.$emit('update:loras', this._loras)
                this.$emit('update:lycos', this._lycos)
                this.$emit('update:embeddings', this._embeddings)
            } catch (e) {
                console.error('[sd-webui-prompt-all-in-one] loadExtraNetworksItems error:', e)
            }
        },
        getExtraNetworkFullName(name, type = 'lora') {
            if (typeof this.extraNetworks !== 'object') return name
            for (let extraNetwork of this.extraNetworks) {
                if (extraNetwork.name !== type) continue
                const nameLowerCase = name.toLowerCase()
                const items = extraNetwork.items[this.subGroupTagsActive?.split('-').pop()] || extraNetwork.items[''] || []
                for (let item of items) {
                    const itemBasename = item.name.replace(/\\/g, '/').split('/').pop()
                    if (
                        item.name.toLowerCase() === nameLowerCase ||
                        item.output_name?.toLowerCase() === nameLowerCase ||
                        itemBasename?.toLowerCase() === nameLowerCase
                    ) {
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
            if (typeof this._loras !== 'object') return name
            return this._loras[name.toLowerCase()] ?? false
        },
        lycoExists(name) {
            if (typeof this._lycos !== 'object') return name
            return this._lycos[name.toLowerCase()] ?? false
        },
        embeddingExists(name) {
            if (typeof this._embeddings !== 'object') return name
            return this._embeddings[name.toLowerCase()] ?? false
        },
    }
}
