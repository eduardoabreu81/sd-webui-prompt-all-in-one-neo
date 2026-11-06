import common from "@/utils/common"
import {ref} from "vue"

export default {
    data() {
        return {
            groupTagsActive: '',
            subGroupTagsActive: '',
            groupTagsProcessed: [],
            extraNetworksRefreshing: false,
        }
    },
    watch: {
        groupTags: {
            handler() {
                this.genGroup()
                if (!this.groupTagsActive || !this.subGroupTagsActive) {
                    this.groupTagsActive = 'favorite'
                    this.subGroupTagsActive = 'favorite-' + this.favoriteKey
                }
                this._setGroupTagItemWidth()
            },
            deep: true,
            immediate: true,
        },
        favorites: {
            handler() {
                this.genGroup()
            },
            deep: true,
            immediate: true,
        },
        extraNetworks: {
            handler() {
                this.genGroup()
            },
            deep: true,
            immediate: true,
        },
        subGroupTagsActive: {
            handler(newVal, oldVal) {
                if (newVal !== oldVal && this.extraNetworks) {
                    this._loadFolderItems(newVal)
                }
            }
        }
    },
    mounted() {
        this.gradioAPI.getData('groupTagsActive-' + this.name).then((data) => {
            if (data !== null && typeof data === 'object') {
                this.groupTagsActive = data.groupTagsActive
                this.subGroupTagsActive = data.subGroupTagsActive
            }
        })
    },
    methods: {
        genGroup() {
            let processed = []
            let favoriteGroup = {
                name: this.getLang('favorite'),
                tabKey: 'favorite',
                type: 'favorite',
                groups: [],
            }
            this.getCurrentTypeFavorites().forEach(item => {
                let subGroup = {
                    color: '',
                    name: this.getLang(item.name),
                    tabKey: 'favorite-' + item.key,
                    type: 'favorite',
                    tags: {},
                    ori: {},
                }
                item.list.forEach(favorite => {
                    subGroup.tags[favorite.prompt] = favorite.name == '' ? favorite.prompt : favorite.name
                    subGroup.ori[favorite.prompt] = favorite
                })
                favoriteGroup.groups.push(subGroup)
            })
            processed.push(favoriteGroup)

            if (!this.$appMode) {
                let extraNetworksGroup = {
                    name: 'Extra Networks',
                    tabKey: 'extraNetworks',
                    type: 'extraNetworks',
                    groups: [],
                }
                this.extraNetworks.forEach(extraNetwork => {
                    if (extraNetwork.items && Object.keys(extraNetwork.items).length > 0) {
                        // Items are loaded - create folder-level groups with actual items
                        // Use dirs to ensure all folders are shown, even if not loaded yet
                        let dirsToShow = extraNetwork.dirs || Object.keys(extraNetwork.items)
                        dirsToShow.forEach(dirname => {
                            let folderItems = extraNetwork.items[dirname] || []
                            let folderSubGroup = {
                                color: '',
                                name: dirname,
                                tabKey: 'extraNetworks-' + extraNetwork.name + '-' + dirname,
                                type: 'extraNetworks',
                                subType: extraNetwork.name,
                                tags: {},
                                datas: folderItems,
                            }
                            if (folderItems.length > 0) {
                                folderItems.forEach(item => {
                                    item.dirnameFormat = item.dirname.replaceAll('\\', '/')
                                })
                                let prefixPath = common.getSamePrefixPath([...new Set(folderItems.map(item => item.dirnameFormat))])
                                let baseDirs = []
                                folderItems.forEach(item => {
                                    let baseDirname = item.dirnameFormat.replace(prefixPath, '')
                                    if (baseDirname === '') baseDirname = '@root'
                                    baseDirname = baseDirname.replace(/^\//, '')
                                    baseDirs.push(baseDirname)
                                    item.base_dirname = baseDirname
                                })
                                baseDirs = [...new Set(baseDirs)]

                                if (baseDirs.length > 1) {
                                    baseDirs.forEach(dir => {
                                        let subDirGroup = {
                                            color: '',
                                            name: dir,
                                            tabKey: 'extraNetworks-' + extraNetwork.name + '-' + dirname + '/' + dir,
                                            type: 'extraNetworks',
                                            subType: extraNetwork.name,
                                            tags: {},
                                            datas: [],
                                        }
                                        folderItems.forEach(item => {
                                            if (item.base_dirname === dir) {
                                                subDirGroup.datas.push(item)
                                            }
                                        })
                                        extraNetworksGroup.groups.push(subDirGroup)
                                    })
                                } else {
                                    extraNetworksGroup.groups.push(folderSubGroup)
                                }
                            } else {
                                extraNetworksGroup.groups.push(folderSubGroup)
                            }
                        })
                    } else if (extraNetwork.dirs && extraNetwork.dirs.length > 0) {
                        // No items loaded yet - create folder tabs
                        extraNetwork.dirs.forEach(dir => {
                            let folderSubGroup = {
                                color: '',
                                name: dir,
                                tabKey: 'extraNetworks-' + extraNetwork.name + '-' + dir,
                                type: 'extraNetworks',
                                subType: extraNetwork.name,
                                isFolder: true,
                                folderName: dir,
                                tags: {},
                                datas: [],
                            }
                            extraNetworksGroup.groups.push(folderSubGroup)
                        })
                    }
                    extraNetworksGroup.groups.push({
                        type: 'wrap',
                    })
                })
                processed.push(extraNetworksGroup)
            }

            processed = processed.concat(this.groupTags)
            this.groupTagsProcessed = processed
        },
        _loadFolderItems(subGroupTabKey) {
            if (!subGroupTabKey || !subGroupTabKey.startsWith('extraNetworks-')) return
            let parts = subGroupTabKey.split('-')
            // Format: extraNetworks-{name}-{dirname}
            // parts[0] = 'extraNetworks', parts[1] = name, parts[2:] = dirname
            if (parts.length < 3) return
            let name = parts[1]
            let dirname = parts.slice(2).join('-')
            if (!dirname || dirname === name) return

            let extraNetwork = this.extraNetworks.find(p => p.name === name)
            if (!extraNetwork) return
            if (!extraNetwork.dirs) return
            if (!extraNetwork.dirs.includes(dirname)) return
            if (extraNetwork.items && extraNetwork.items[dirname]) return

            this.$emit('refreshExtraNetworks')
            this.loadExtraNetworksItems(name, dirname).finally(() => {
                this.$emit('refreshExtraNetworks')
            })
        },
        saveGroupActive() {
            this.gradioAPI.setData('groupTagsActive-' + this.name, {
                groupTagsActive: this.groupTagsActive,
                subGroupTagsActive: this.subGroupTagsActive,
            })
        },
        activeGroupTab(index) {
            this.groupTagsActive = this.groupTagsProcessed[index].tabKey
            this.subGroupTagsActive = this.groupTagsProcessed[index].groups[0].tabKey
            this.saveGroupActive()
            let scrollLeft = this.$refs.groupTabsHeader.children[index].offsetLeft - this.$refs.groupTabsHeader.offsetWidth / 2 + this.$refs.groupTabsHeader.children[index].offsetWidth / 2
            this.$refs.groupTabsHeader.scrollTo({
                left: scrollLeft,
                behavior: 'smooth'
            })
            this._setGroupTagItemWidth()
        },
        activeSubGroupTab(index, subIndex) {
            this.subGroupTagsActive = this.groupTagsProcessed[index].groups[subIndex].tabKey
            this.saveGroupActive()
            this._setGroupTagItemWidth()
        },
        _setGroupTagItemWidth() {
            this.$nextTick(() => {
                if (!this.$refs.groupTagItem) return
                this.$refs.groupTagItem.forEach((item, index) => {
                    item.style.width = 'auto'
                })
                let maxWidth = 0
                this.$refs.groupTagItem.forEach((item, index) => {
                    maxWidth = Math.max(maxWidth, item.offsetWidth)
                })
                if (maxWidth > 0) {
                    this.$refs.groupTagItem.forEach((item, index) => {
                        item.style.width = maxWidth + 'px'
                    })
                }
            })
        },
        onClickHideGroupTags() {
            this.$emit('update:hideGroupTags', !this.hideGroupTags)
        },
        onClickGroupTag(local, en, group, subGroup) {
            let indexes = []
            this.tags.forEach((tag, index) => {
                if (tag.originalValue === en) {
                    indexes.push(index)
                }
            })
            if (indexes.length) {
                indexes.reverse().forEach((index) => {
                    this.tags.splice(index, 1)
                })
                this.updateTags()
            } else {
                if (group.type === 'favorite') {
                    let favorite = subGroup.ori[en]
                    this.onClickGroupTagFavorite(favorite)
                } else {
                    this._appendTag(en, local, false, -1, 'text')
                    this.updateTags()
                }
            }
        },
        onClickGroupTagFavorite(favorite) {
            favorite.tags.forEach((tag) => {
                this._appendTag(tag.value, tag.localValue, tag.disabled, -1, tag.type)
            })
            this.updateTags()
        },
        onClickGroupTagExtraNetwork(data, group, subGroup) {
            if (subGroup.subType === 'checkpoints') {
                if (data.loading) return
                data.loading = true
                let setLoading = (num) => {
                    if (num > 100) {
                        data.loading = false
                        setTimeout(this.onClickGroupExtraNetworkRefresh, 1000)
                        return
                    }
                    if (opts && opts.sd_model_checkpoint) {
                        let isLoaded = false
                        let checkpoint = opts.sd_model_checkpoint
                        if (checkpoint.indexOf('['+ data.shorthash +']') > -1) {
                            isLoaded = true
                        } else {
                            checkpoint = checkpoint.replaceAll('\\', '/')
                            let baseDirname = data.baseDirname
                            if (baseDirname === '@root') baseDirname = ''
                            if (checkpoint.indexOf(baseDirname + '/' + data.basename) > -1) {
                                isLoaded = true
                            } else {
                                if (checkpoint.indexOf(data.basename) > -1) {
                                    isLoaded = true
                                }
                            }
                        }
                        if (isLoaded) {
                            data.loading = false
                            setTimeout(this.onClickGroupExtraNetworkRefresh, 1000)
                            return
                        }
                    }

                    setTimeout(setLoading, 100, num + 1)
                }
                setLoading(0)
                console.log(data)
                if (data.onclick) {
                    let e = document.createElement('div')
                    e.innerHTML = data.onclick
                    let onclick = e.textContent || e.innerText
                    onclick = onclick.replace(/^"/, '').replace(/"$/, '').trim()
                    onclick = onclick.replace(/^return /, '').trim()
                    console.log(onclick)
                    eval(onclick)
                } else {
                    selectCheckpoint(data.basename)
                }
                return
            }
            let indexes = this._groupTagsExtraNetworkTagsIndexes(data)
            if (indexes.length) {
                indexes.reverse().forEach((index) => {
                    console.log(index)
                    this.tags.splice(index, 1)
                })
                this.updateTags()
            } else {
                let index = this._appendTag(eval(data.prompt), '', false, -1, 'text')
                if (this.autoTranslateToLocal) {
                    this.translates([index], true, false).finally(() => {
                        this.updateTags()
                    })
                } else {
                    this.updateTags()
                }
            }
        },
        getGroupTagTooltip(local, en) {
            let html = ''
            if (local && local !== en) {
                html += local + '<br/>'
            }
            html += en
            return html
        },
        getGroupTagStyle(groupName, subGroupName, value) {
            let style = {}
            let colorKey = common.getTagsColorKey(groupName, subGroupName)
            let color = ''
            if (this.groupTagsColor[colorKey]) {
                color = this.groupTagsColor[colorKey]
                if (common.isColorTransparent(color)) {
                    color = ''
                }
            }
            if (color) {
                style = {background: color}
            }
            for (let tag of this.tags) {
                if (tag.originalValue === value) {
                    style['filter'] = 'grayscale(1)'
                    break
                }
            }
            return style
        },
        _groupTagsExtraNetworkTagsIndexes(data) {
            let name = data.name
            let output_name = data.output_name || undefined
            let indexes = []
            for (let index in this.tags) {
                let tag = this.tags[index]
                if (typeof tag['type'] === 'string' && tag.type === 'wrap') continue
                let find = false
                if (tag.isLora) {
                    find = tag.loraName === name || (output_name && tag.loraName === output_name)
                } else if (tag.isLyco) {
                    find = tag.lycoName === name || (output_name && tag.lycoName === output_name)
                } else if (tag.isEmbedding) {
                    find = tag.embeddingName === name || (output_name && tag.embeddingName === output_name)
                } else {
                    find = tag.originalValue === name || (output_name && tag.originalValue === output_name)
                }
                if (find) {
                    indexes.push(index)
                }
            }
            return indexes
        },
        getGroupTagExtraNetworkStyle(data) {
            let indexes = this._groupTagsExtraNetworkTagsIndexes(data)
            let style = {
                width: this.extraNetworksWidth + 'px',
                height: this.extraNetworksHeight + 'px',
            }
            if (indexes.length) style['filter'] = 'grayscale(1)'
            return style
        },
        getTagsColorKey(groupName, subGroupName) {
            return common.getTagsColorKey(groupName, subGroupName)
        },
        onTagsColorChange(key) {
            this.$emit('update:groupTagsColor', this.groupTagsColor)
        },
        onClickResetTagsColor(key) {
            for (let item of this.groupTagsProcessed) {
                for (let group of item.groups) {
                    if (group.type && group.typ == 'wrap') continue
                    let key2 = common.getTagsColorKey(item.name, group.name)
                    if (key === key2) {
                        this.groupTagsColor[key] = ref(common.fitterInputColor(group.color))
                    }
                }
            }
            this.onTagsColorChange(key)
        },
        onClickClearTagsColor(key) {
            this.groupTagsColor[key] = ref('rgba(0,0,0,0)')
            this.onTagsColorChange(key)
        },
        getTagColorStyle(tag) {
            if (tag.isLora || tag.isLyco || tag.isEmbedding) return {}
            if (!this.groupTagsColorKeyCache[tag.value]) return {}
            let key = this.groupTagsColorKeyCache[tag.value]
            if (!this.groupTagsColor[key]) return {}
            let color = this.groupTagsColor[key]
            if (common.isColorTransparent(color)) return {}
            return {background: color}
        },
        onGroupExtraNetworkMouseEnter(e, name) {
            this.$emit('showExtraNetworks', e.target, name, this.onLoraPopupUseKeywords, true, 'groupTags')
        },
        onGroupExtraNetworkMouseMove() {
        },
        onGroupExtraNetworkMouseLeave() {
            this.$emit('hideExtraNetworks')
        },
        onClickGroupExtraNetworkRefresh() {
            // Find the currently active folder and reload its items
            if (!this.subGroupTagsActive || !this.subGroupTagsActive.startsWith('extraNetworks-')) {
                // No extra networks active, just refresh the whole list
                this._refreshAllExtraNetworks()
                return
            }
            let parts = this.subGroupTagsActive.split('-')
            if (parts.length < 3) {
                this._refreshAllExtraNetworks()
                return
            }
            let name = parts[1]
            let dirname = parts.slice(2).join('-')
            if (!dirname || dirname === name) {
                this._refreshAllExtraNetworks()
                return
            }

            let extraNetwork = this.extraNetworks.find(p => p.name === name)
            if (!extraNetwork) {
                this._refreshAllExtraNetworks()
                return
            }

            // Clear items for this specific folder and reload
            delete extraNetwork.items[dirname]
            this.loadExtraNetworksItems(name, dirname).finally(() => {
                // Reload dirs to refresh the folder list
                this._refreshDirs()
            })
        },
        async _refreshDirs() {
            try {
                const dirsData = await this.gradioAPI.getExtraNetworksDirs()
                if (!dirsData) return
                dirsData.forEach(newPage => {
                    let oldPage = this.extraNetworks.find(p => p.name === newPage.name)
                    if (oldPage) {
                        oldPage.dirs = newPage.dirs
                    }
                })
            } catch (e) {
                console.error('[sd-webui-prompt-all-in-one] _refreshDirs error:', e)
            }
        },
        async _refreshAllExtraNetworks() {
            try {
                const dirsData = await this.gradioAPI.getExtraNetworksDirs()
                if (!dirsData) return
                this.extraNetworks = dirsData.map(page => ({
                    name: page.name,
                    title: page.title,
                    dirs: page.dirs,
                    items: {},
                }))
                this.extraNetworksLoaded = true
            } catch (e) {
                console.error('[sd-webui-prompt-all-in-one] _refreshAllExtraNetworks error:', e)
            }
        },
    }
}
