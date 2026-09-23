// Executed directly by node (type stripping), so only erasable TypeScript syntax is allowed here.
// The file is CommonJS like the rest of the package, hence `require` instead of `import`.
import type { SocketCommands as SocketCommandsClass } from './src/lib/socketCommands';

const { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } =
    require('node:fs') as typeof import('node:fs');

interface ParamType {
    name: string;
    type: string;
}

interface ParamDescription {
    name: string;
    description: string;
}

interface CommandDescription {
    name: string;
    description: string;
    isDeprecated: boolean;
    params: { name: string; type: string; description: string | undefined }[];
    group: string;
}

type CommandsConstructor = new (adapter: any, updateSession?: any, context?: any) => SocketCommandsClass;

function parseFunctionSignature(signature: string): ParamType[] {
    let args: string[] = [];

    if (signature.includes('\n')) {
        signature = signature.trim().replace(/^\(/, '').replace(/\)$/, '');
        const lines = signature.split('\n').filter(a => a.trim());
        // remember padding
        const padding = lines[0].match(/^(\s*)/)?.[1] || '';
        let many = '';
        for (let i = 0; i < lines.length; i++) {
            // remove standard padding
            const line = lines[i].substring(padding.length);
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
        .map((param): ParamType | null => {
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
        .filter((line): line is ParamType => !!line);
}

function extractFunctionDescription(fileContent: string, command: string): CommandDescription {
    const regex = new RegExp(
        `\\/\\*\\*\\s+\\*\\s*#([a-zA-Z0-9\\s*+.%,\\u9999\\\\?'"\`\\/!=>_<@|\\[\\]:;\\(\\)}{-]+?)\\*\\/\\s*this\.commands\.${command}\\s*=\\s*\(([^\\#]+?)\):\\s*void\\s*=>\\s*{`,
        'g',
    );

    const match = regex.exec(fileContent);
    if (!match) {
        throw new Error(`"${command}" Not found`);
    }
    const [, docComment, paramsDefinitions] = match;
    const paramsDescriptions: ParamDescription[] = [];

    let group = '';

    const description = docComment
        .split('\n')
        .map(line => line.trim().replace(/^\*\s?/, ''))
        .filter(line => {
            if (line.includes('DOCUMENTATION')) {
                group = line.split(' ')[1];
                return false;
            }
            if (!line) {
                return false;
            }
            if (line.startsWith('@')) {
                // parse '@param socket Socket instance'
                const m = line.match(/^@param\s+([_\w]+)\s(.*)$/);
                if (m) {
                    paramsDescriptions.push({ name: m[1], description: m[2] });
                }
                return false;
            }
            return true;
        })
        .join('\n');
    const isDeprecated = description.includes('@deprecated');

    const types = parseFunctionSignature(paramsDefinitions);

    const params = types.map(t => ({
        name: t.name,
        type: t.type,
        description: paramsDescriptions.find(it => it.name === t.name.replace('?', ''))?.description,
    }));

    return { name: command, description, isDeprecated, params, group };
}

function replaceReadme(key: string, text: string): void {
    const readme = readFileSync('README.md', 'utf8');
    const lines = readme.split('\n');
    const result: string[] = [];
    let skip = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`${key}_START`)) {
            skip = true;
            result.push(`<!-- ${key}_START -->`);
            result.push(text);
            result.push(`<!-- ${key}_END -->`);
        } else if (lines[i].includes(`${key}_END`)) {
            skip = false;
        } else if (!skip) {
            result.push(lines[i]);
        }
    }
    writeFileSync('README.md', result.join('\n'));
}

function getCommands(Commands: CommandsConstructor, content: string, index: string): string[] {
    const commands = new Commands({ config: { thresholdValue: 1 } }, undefined, { language: 'en' });
    const texts: string[] = [];
    const links: string[] = [];

    const groups: Record<string, CommandDescription[]> = {};

    // `commands` is protected, but the documentation needs the list of registered commands
    Object.keys((commands as unknown as { commands: Record<string, unknown> }).commands).forEach(command => {
        try {
            const result = extractFunctionDescription(content, command);
            groups[result.group] ||= [];
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

function loadSocketCommands(): CommandsConstructor {
    return (require('./build/lib/socketCommands') as typeof import('./src/lib/socketCommands')).SocketCommands;
}

function loadSocketCommandsAdmin(): CommandsConstructor {
    return (require('./build/lib/socketCommandsAdmin') as typeof import('./src/lib/socketCommandsAdmin'))
        .SocketCommandsAdmin;
}

if (process.argv.includes('--webList')) {
    const content = readFileSync('src/lib/socketCommands.ts').toString('utf-8');
    const texts = getCommands(loadSocketCommands(), content, '_w');

    replaceReadme('WEB_METHODS', texts.join('\n'));
} else if (process.argv.includes('--adminList')) {
    const content =
        readFileSync('src/lib/socketCommands.ts').toString('utf-8') +
        readFileSync('src/lib/socketCommandsAdmin.ts').toString('utf-8');
    const texts = getCommands(loadSocketCommandsAdmin(), content, '_a');

    replaceReadme('ADMIN_METHODS', texts.join('\n'));
} else if (process.argv.includes('--prebuild')) {
    if (!existsSync(`${__dirname}/build`)) {
        mkdirSync(`${__dirname}/build`);
    }
    copyFileSync(`${__dirname}/src/types.d.ts`, `${__dirname}/build/types.d.ts`);
} else {
    const content =
        readFileSync('src/lib/socketCommands.ts').toString('utf-8') +
        readFileSync('src/lib/socketCommandsAdmin.ts').toString('utf-8');
    let texts = getCommands(loadSocketCommands(), content, '_w');

    replaceReadme('WEB_METHODS', texts.join('\n'));

    texts = getCommands(loadSocketCommandsAdmin(), content, '_a');

    replaceReadme('ADMIN_METHODS', texts.join('\n'));
}
