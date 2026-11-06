export default (tags, autoBreakBeforeWrap = false, autoBreakAfterWrap = false) => {
    if (tags === null || tags === undefined || tags === false || tags === "" || tags.trim() === "") return []

    // Process each paragraph (newline-separated) independently
    let paragraphs = tags.split('\n')
    let result = []

    for (let i = 0; i < paragraphs.length; i++) {
        let p = paragraphs[i]
        let trimmed = p.trim()
        
        // Add wrap tag before each paragraph (except first) to preserve paragraph boundaries
        if (i > 0) {
            result.push('\n')
        }
        
        if (trimmed === '') {
            continue
        }

        // Sentence-mode: has periods outside of angle brackets
        let textWithoutBrackets = trimmed.replace(/<[^>]+>/g, '')
        if (textWithoutBrackets.includes('.')) {
            result.push(...trimmed.split('.')
                .map(s => s.trim())
                .filter(s => s !== '')
                .map(s => s + '.'))
        } else {
            // Tag-mode: use original splitting logic
            let temp = trimmed.replace(/[。.]\s*$/, '')
            temp = temp.replace(/，/g, ',')
            temp = temp.replace(/。/g, ',')
            temp = temp.replace(/、/g, ',')
            temp = temp.replace(/；/g, ',')
            temp = temp.replace(/．/g, ',')

            // Emoji handling
            let emojis = [
                {emoji: ">_<", re: /\>_\</g},
                {emoji: ":<", re: /\:\</g},
                {emoji: ">:<", re: /\>\:\</g},
                {emoji: ":>", re: /\:\>/g},
                {emoji: ":-(", re: /\:\-\(/g},
                {emoji: ":-)", re: /\:\-\)/g},
            ]
            emojis.forEach((emoji, index) => {
                temp = temp.replace(emoji.re, "|||EXPRESSION" + index + "|||")
            })

            const brackets = {
                '(': ')',
                '[': ']',
                '<': '>',
                '{': '}'
            }
            const bracketStarts = Object.keys(brackets)

            let length = temp.length
            let current = ''
            let startBracketChar = ''
            let endBracketChar = ''
            let bracketCount = 0
            let tagResult = []

            for (let j = 0; j < length; j++) {
                const char = temp[j]
                if (char === "\n") {
                    if (startBracketChar === '') {
                        if (current.trim() !== "") {
                            tagResult.push(current.trim())
                        }
                        tagResult.push("\n")
                        bracketCount = 0
                        startBracketChar = ''
                        endBracketChar = ''
                        current = ''
                    } else {
                        current += ' '
                    }
                } else if (char === ",") {
                    if (startBracketChar === '') {
                        tagResult.push(current.trim())
                        bracketCount = 0
                        startBracketChar = ''
                        endBracketChar = ''
                        current = ''
                    } else {
                        current += char
                    }
                } else {
                    if (startBracketChar === '') {
                        if (bracketStarts.includes(char)) {
                            bracketCount = 1
                            startBracketChar = char
                            endBracketChar = brackets[char]
                            current += char
                        } else {
                            if (char === " " && current.trim() === 'BREAK') {
                                tagResult.push(current.trim())
                                bracketCount = 0
                                startBracketChar = ''
                                endBracketChar = ''
                                current = ''
                            } else {
                                current += char
                                if (current.endsWith(' BREAK')) {
                                    current = current.substring(0, current.length - ' BREAK'.length)
                                    tagResult.push(current.trim())
                                    tagResult.push('BREAK')
                                    bracketCount = 0
                                    startBracketChar = ''
                                    endBracketChar = ''
                                    current = ''
                                }
                            }
                        }
                    } else {
                        if (char === endBracketChar) {
                            bracketCount--
                            if (bracketCount === 0) {
                                startBracketChar = ''
                                endBracketChar = ''
                                current += char
                            } else {
                                current += char
                            }
                        } else if (char === startBracketChar) {
                            bracketCount++
                            current += char
                        } else {
                            current += char
                        }
                    }
                }
            }
            if (current !== '') {
                tagResult.push(current.trim())
            }

            // Post-process tags
            for (let value of tagResult) {
                if (value === "\n") {
                    result.push(value)
                    continue
                }
                let start = value[0]
                let end = value[value.length - 1]
                if (start === '[' && end === ']') {
                    result.push(value)
                    continue
                }
                if (start === '(' && end === ')') {
                    result.push(value)
                    continue
                }
                if (start === '{' && end === '}') {
                    result.push(value)
                    continue
                }

                // Lora tag handling
                let regex = /\<lora:[^\>]+\>/
                let match = null
                let values = []
                while (match = regex.exec(value)) {
                    let startIndex = match.index
                    let endIndex = startIndex + match[0].length
                    let before = value.substring(0, startIndex).trim()
                    let after = value.substring(endIndex).trim()
                    let middle = match[0]
                    values.push(before)
                    values.push(middle)
                    value = after
                }
                values.push(value)
                for (let value2 of values) {
                    if (value2 === '' || value2.trim() === '') continue
                    emojis.forEach((emoji, index) => {
                        value2 = value2.replace("|||EXPRESSION" + index + "|||", emoji.emoji)
                    })
                    result.push(value2)
                }
            }
        }
    }
    // Remove trailing newline if present
    if (result.length > 0 && result[result.length - 1] === '\n') {
        result.pop()
    }
    return result
}
