const { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } = require('node:fs');

function parseFunctionSignature(signature) {
    let args = [];

    if (signature.includes('\n')) {
        signature = signature.trim().replace(/^\(/, '').replace(/\)$/, '');
        const lines = signature.split('\n').filter(a => a.trim());
        // remember padding
        const m = lines[0].match(/^(\s*)/);
        let many = '';
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            // remove standard padding
            line = line.substring(m[1].length);
            if (line.startsWith(' ')) {
                many += line;
            } else {
                if (many) {
                    args.push(many);
                    many = '';
                }
                many += line;
            }
        }
        if (many) {
            args.push(many);
        }
    } else {
        signature = signature
            .replace(/^\(/, '')
            .replace(/\): void$/, '')
            .replace(/\)$/, '');
        args = signature.split(',');
    }

    return args
        .map(param => {
            const name = param.substring(0, param.indexOf(':')).trim();
            let type = param
                .substring(param.indexOf(':') + 1)
                .trim()
                .replace(/,$/, '');

            if (!name || name === 'socket' || name === '_socket') {
                return null;
            }
            if (name === 'callback') {
                if (type.startsWith('(')) {
                    type += ') => void';
                }
            }
            type = type.trim().replace(/^\|/, '');
            // replace all double spaces
            type = type
                .replace(/\s+/g, ' ')
                .replace(/\(\s/g, '(')
                .replace(/\{\s/g, '{')
                .replace(/\s\)/g, ')')
                .replace(/\s}/g, '}');

            // read types
            return { name, type };
        })
        .filter(line => line);
}

function extractFunctionDescription(fileContent, command) {
    const regex = new RegExp(
        `\\/\\*\\*\\s+\\*\\s*#([a-zA-Z0-9\\s*+.%,\\u9999\\\\?'"\`\\/!=>_<@|\\[\\]:;\\(\\)}{-]+?)\\*\\/\\s*this\.commands\.${command}\\s*=\\s*\(([^\\#]+?)\):\\s*void\\s*=>\\s*{`,
        'g',
    );

    const match = regex.exec(fileContent);
    if (!match) {
        throw new Error(`"${command}" Not found`);
    }
    const [_, docComment, paramsDefinitions] = match;
    const paramsDescriptions = [];

    let group = '';

    const description = docComment
        .split('\n')
        .map(line => line.trim().replace(/^\*\s?/, ''))
        .filter(line => {
            if (line?.includes('DOCUMENTATION')) {
                group = line.split(' ')[1];
            } else if (line) {
                if (line.startsWith('@')) {
                    // parse '@param socket Socket instance'
                    const m = line.match(/^@param\s+([_\w]+)\s(.*)$/);
                    if (m) {
                        paramsDescriptions.push({ name: m[1], description: m[2] });
                    }
                    return null;
                }

                return line;
            }
        })
        .filter(t => t !== null)
        .join('\n');
    const isDeprecated = description.includes('@deprecated');

    const types = parseFunctionSignature(paramsDefinitions);

    const params = types.map(t => {
        const description = paramsDescriptions.find(it => it.name === t.name.replace('?', ''))?.description;
        if (!description) {
            debugger;
        }

        return {
            name: t.name,
            type: t.type,
            description,
        };
    });

    return { name: command, description, isDeprecated, params, group };
}

function replaceReadme(key, text) {
    const readme = readFileSync('README.md', 'utf8');
    const lines = readme.split('\n');
    const result = [];
    let skip = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(key + '_START')) {
            skip = true;
            result.push(`<!-- ${key}_START -->`);
            result.push(text);
            result.push(`<!-- ${key}_END -->`);
        } else if (lines[i].includes(key + '_END')) {
            skip = false;
        } else if (!skip) {
            result.push(lines[i]);
        }
    }
    writeFileSync('README.md', result.join('\n'));
}

function getCommands(Commands, content, index) {
    const commands = new Commands({ config: { thresholdValue: 1 } }, undefined, { language: 'en' });
    const texts = [];
    const links = [];

    const groups = {};

    Object.keys(commands.commands).forEach(command => {
        try {
            const result = extractFunctionDescription(content, command);
            groups[result.group] = groups[result.group] || [];
            groups[result.group].push(result);
        } catch (e) {
            console.error(e);
        }
    });

    Object.keys(groups).forEach(group => {
        texts.push(`### ${group[0].toUpperCase() + group.substring(1)}`);
        groups[group].forEach(command => {
            let text = `#### <a name="${command.name.toLowerCase()}${index}"></a>\`${command.name}(${command.params.map(it => it.name).join(', ')})\`\n`;
            links.push(`* [\`${command.name}\`](#${command.name.toLowerCase()}${index})`); // #authenticateuser-pass-callback
            text += `${command.description}\n`;
            command.params.forEach(param => {
                if (param.description) {
                    text += `* \`${param.name}\` ${param.type ? `*${param.type}*` : ''}: ${param.description}\n`;
                } else {
                    text += `* ${param.name}: '--'\n`;
                }
            });

            texts.push(text);
        });
    });

    links.unshift('### List of commands');
    return links.concat(texts);
}

if (process.argv.includes('--webList')) {
    const content = readFileSync('src/lib/socketCommands.ts').toString('utf-8');
    const { SocketCommands } = require('./dist/lib/socketCommands');
    const texts = getCommands(SocketCommands, content, '_w');

    replaceReadme('WEB_METHODS', texts.join('\n'));
} else if (process.argv.includes('--adminList')) {
    const content =
        readFileSync('src/lib/socketCommands.ts').toString('utf-8') +
        readFileSync('src/lib/socketCommandsAdmin.ts').toString('utf-8');
    const { SocketCommandsAdmin } = require('./dist/lib/socketCommandsAdmin');
    const texts = getCommands(SocketCommandsAdmin, content, '_a');

    replaceReadme('ADMIN_METHODS', texts.join('\n'));
} else if (process.argv.includes('--prebuild')) {
    if (!existsSync(`${__dirname}/dist`)) {
        mkdirSync(`${__dirname}/dist`);
    }
    copyFileSync(`${__dirname}/src/types.d.ts`, `${__dirname}/dist/types.d.ts`);
} else {
    const content =
        readFileSync('src/lib/socketCommands.ts').toString('utf-8') +
        readFileSync('src/lib/socketCommandsAdmin.ts').toString('utf-8');
    const { SocketCommands } = require('./dist/lib/socketCommands');
    let texts = getCommands(SocketCommands, content, '_w');

    replaceReadme('WEB_METHODS', texts.join('\n'));

    const { SocketCommandsAdmin } = require('./dist/lib/socketCommandsAdmin');
    texts = getCommands(SocketCommandsAdmin, content, '_a');

    replaceReadme('ADMIN_METHODS', texts.join('\n'));
}
